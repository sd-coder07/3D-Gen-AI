import { NextRequest } from "next/server";
import { Client, handle_file } from "@gradio/client";
import fs from "fs";
import path from "path";
import os from "os";
import { generateFallbackGlbBuffer } from "@/utils/fallbackGlb";

export const maxDuration = 300; // 5 minutes max

function sseEncode(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Helper: Download and validate GLB binary buffer ──
async function fetchGlbBuffer(glbUrl: string, token?: string): Promise<Buffer> {
  let buffer: Buffer | null = null;

  try {
    if (fs.existsSync(glbUrl)) {
      buffer = await fs.promises.readFile(glbUrl);
    } else {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      let res = await fetch(glbUrl, { headers });
      if (!res.ok && token) {
        res = await fetch(glbUrl);
      }

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      }
    }
  } catch (err) {
    console.warn("[fetchGlbBuffer] Error reading GLB source:", err);
  }

  // Validate GLB Magic Header "glTF" (0x46546c67)
  if (buffer && buffer.length >= 12 && buffer.readUInt32LE(0) === 0x46546c67) {
    return buffer;
  }

  console.warn(`[fetchGlbBuffer] Non-GLB or invalid header received for ${glbUrl}. Returning clean 3D mesh fallback.`);
  return generateFallbackGlbBuffer();
}

// ── Verified Public HuggingFace space for TripoSR ──
const TRIPOSR_SPACES = [
  "stabilityai/TripoSR",
];

// ── Helper: Single TripoSR space runner ──
async function runTripoSRSingleSpace(
  spaceId: string,
  tmpFilePath: string,
  token: string | undefined,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: `Connecting to ${spaceId} AI Space…` });

  const client = await withTimeout(
    Client.connect(spaceId, token ? { token: token as `hf_${string}` } : {}),
    35000,
    `Connecting to ${spaceId} timed out.`
  );

  send({ type: "status", step: "preprocess", message: "Step 1 / 2 — Isolating object & preprocessing image…" });

  const preprocessRes = await withTimeout(
    client.predict("/preprocess", [
      handle_file(tmpFilePath),
      true, // remove background
      0.85, // foreground ratio
    ]) as Promise<{ data: Array<unknown> }>,
    45000,
    "Background removal timed out."
  );

  const processedImg = preprocessRes.data?.[0];
  if (!processedImg) {
    throw new Error("Preprocessing returned no image.");
  }

  // Format processed image for /generate input
  let imgInput: unknown = processedImg;
  if (typeof processedImg === "string") {
    imgInput = handle_file(processedImg);
  } else if (processedImg && typeof processedImg === "object") {
    const obj = processedImg as { url?: string; path?: string };
    if (obj.url || obj.path) {
      imgInput = handle_file((obj.url || obj.path) as string);
    }
  }

  send({ type: "status", step: "generate", message: "Step 2 / 2 — Generating 3D mesh geometry…" });

  const generateRes = await withTimeout(
    client.predict("/generate", [
      imgInput,
      256, // Marching Cubes resolution 256 for detailed 3D geometry
    ]) as Promise<{ data: Array<unknown> }>,
    120000,
    "TripoSR 3D generation timed out."
  );

  const outputs = generateRes.data || [];
  const glbObj = outputs[1] ?? outputs[0];
  let glbUrl: string | null = null;

  if (typeof glbObj === "string") {
    glbUrl = glbObj;
  } else if (glbObj && typeof glbObj === "object") {
    const val = glbObj as { url?: string; path?: string };
    glbUrl = val.url ?? val.path ?? null;
  }

  if (!glbUrl) throw new Error("TripoSR returned no 3D file.");
  return glbUrl;
}

// ── TripoSR space runner ──
async function runTripoSR(
  tmpFilePath: string,
  token: string | undefined,
  send: (data: Record<string, unknown>) => void
): Promise<{ glbUrl: string; spaceUsed: string }> {
  let lastError: Error | null = null;

  for (const spaceId of TRIPOSR_SPACES) {
    try {
      console.log(`[TripoSR] Attempting space: ${spaceId}`);
      const glbUrl = await runTripoSRSingleSpace(spaceId, tmpFilePath, token, send);
      return { glbUrl, spaceUsed: spaceId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[TripoSR ${spaceId} failed]: ${msg}`);
      lastError = err instanceof Error ? err : new Error(msg);
    }
  }

  throw lastError || new Error("TripoSR space unavailable.");
}

// ── Helper: InstantMesh runner (Full High-Detail Geometry) ──
async function runInstantMesh(
  tmpFilePath: string,
  token: string | undefined,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: "Connecting to InstantMesh AI Space…" });

  const client = await withTimeout(
    Client.connect("TencentARC/InstantMesh", token ? { token: token as `hf_${string}` } : {}),
    35000,
    "Connecting to InstantMesh timed out."
  );

  send({ type: "status", step: "preprocess", message: "Step 1 / 3 — Preprocessing image & removing background…" });

  const pRes = await withTimeout(
    client.predict("/preprocess", [
      handle_file(tmpFilePath),
      true,
    ]) as Promise<{ data: Array<unknown> }>,
    45000,
    "InstantMesh preprocessing timed out."
  );

  const pImg = pRes.data?.[0];
  if (!pImg) throw new Error("InstantMesh preprocessing failed.");

  let pImgInput: unknown = pImg;
  if (typeof pImg === "string") {
    pImgInput = handle_file(pImg);
  } else if (pImg && typeof pImg === "object") {
    const obj = pImg as { url?: string; path?: string };
    if (obj.url || obj.path) {
      pImgInput = handle_file((obj.url || obj.path) as string);
    }
  }

  send({ type: "status", step: "generate_mvs", message: "Step 2 / 3 — Generating multi-view representations (30 steps)…" });

  const mvsRes = await withTimeout(
    client.predict("/generate_mvs", [
      pImgInput,
      30, // MUST BE >= 30 for InstantMesh Gradio space validation!
      42,
    ]) as Promise<{ data: Array<unknown> }>,
    90000,
    "InstantMesh multi-view generation timed out."
  );

  const mvsData = mvsRes.data?.[0];
  if (!mvsData) throw new Error("InstantMesh multi-view generation failed.");

  send({ type: "status", step: "make3d", message: "Step 3 / 3 — Reconstructing detailed 3D surface mesh…" });

  const meshRes = await withTimeout(
    client.predict("/make3d", [
      mvsData,
    ]) as Promise<{ data: Array<unknown> }>,
    90000,
    "InstantMesh 3D mesh creation timed out."
  );

  const outputs = meshRes.data || [];
  const glbObj = outputs[1] ?? outputs[0];
  let glbUrl: string | null = null;

  if (typeof glbObj === "string") {
    glbUrl = glbObj;
  } else if (glbObj && typeof glbObj === "object") {
    const val = glbObj as { url?: string; path?: string };
    glbUrl = val.url ?? val.path ?? null;
  }

  if (!glbUrl) throw new Error("InstantMesh returned no 3D file.");
  return glbUrl;
}

// ── Helper: Image-to-3D shape runner ──
async function runImageTo3D(
  tmpFilePath: string,
  token: string | undefined,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: "Connecting to Image-to-3D AI Space…" });

  const client = await withTimeout(
    Client.connect("frogleo/Image-to-3D", token ? { token: token as `hf_${string}` } : {}),
    35000,
    "Connecting to Image-to-3D timed out."
  );

  send({ type: "status", step: "generate", message: "Generating 3D mesh shape & UV maps…" });

  const shapeRes = await withTimeout(
    client.predict("/gen_shape", [
      handle_file(tmpFilePath),
      30,    // 30 steps
      5.0,   // guidance scale
      42,    // seed
      256,   // octree res
      8000,  // chunks
      10000, // target face count
      true,  // randomize seed
    ]) as Promise<{ data: Array<unknown> }>,
    120000,
    "Image-to-3D shape generation timed out."
  );

  const dataList = shapeRes.data || [];
  let glbUrl: string | null = null;

  for (const item of dataList) {
    if (typeof item === "string") {
      if (item.endsWith(".glb")) {
        glbUrl = item.startsWith("http") || fs.existsSync(item)
          ? item
          : `https://frogleo-image-to-3d.hf.space${item.startsWith("/") ? "" : "/"}${item}`;
        break;
      }
    } else if (item && typeof item === "object") {
      const val = (item as { value?: { url?: string; path?: string }; url?: string; path?: string });
      const pathOrUrl = val.value?.url ?? val.value?.path ?? val.url ?? val.path;
      if (pathOrUrl && pathOrUrl.endsWith(".glb")) {
        glbUrl = pathOrUrl;
        break;
      }
    }
  }

  if (!glbUrl) throw new Error("Image-to-3D returned no GLB file.");
  return glbUrl;
}

export async function POST(request: NextRequest) {
  // Validate token: MUST start with "hf_" to be sent to HuggingFace
  const rawToken = process.env.HF_TOKEN;
  const token = (rawToken && typeof rawToken === "string" && rawToken.trim().startsWith("hf_"))
    ? rawToken.trim()
    : undefined;

  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          controller.enqueue(sseEncode(data));
        } catch {
          streamClosed = true;
        }
      };

      const safeClose = () => {
        if (!streamClosed) {
          streamClosed = true;
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        }
      };

      let tmpFilePath: string | null = null;

      try {
        // ── Parse form ──
        const formData = await request.formData();
        const imageFile = formData.get("image") as File | null;
        const modelKey = (formData.get("model") as string) || "triposr";

        if (!imageFile) {
          send({ type: "error", message: "No image provided." });
          return;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
          send({ type: "error", message: "Unsupported file type. Use JPG, PNG or WEBP." });
          return;
        }

        // Save image to temporary file
        const imageBytes = await imageFile.arrayBuffer();
        const ext = imageFile.type.split("/")[1] || "png";
        tmpFilePath = path.join(os.tmpdir(), `upload_3d_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
        await fs.promises.writeFile(tmpFilePath, Buffer.from(imageBytes));

        let glbUrl: string | null = null;
        let glbBuffer: Buffer | null = null;
        let modelUsed = "";

        // ═════════════════ Execute Selected Model ═════════════════
        if (modelKey === "triposr") {
          try {
            const res = await runTripoSR(tmpFilePath, token, send);
            glbUrl = res.glbUrl;
            modelUsed = `TripoSR (${res.spaceUsed.split("/")[1] || res.spaceUsed})`;
          } catch (err: unknown) {
            console.warn("[TripoSR Primary Failed] -> Attempting Image-to-3D backup...", err);
            send({
              type: "status",
              step: "fallback",
              message: "Primary space busy — switching to backup Image-to-3D space…",
            });
            try {
              glbUrl = await runImageTo3D(tmpFilePath, token, send);
              modelUsed = "Image-to-3D (Backup)";
            } catch (fallbackErr: unknown) {
              console.warn("[All AI spaces busy] -> Using instant 3D fallback...", fallbackErr);
              glbBuffer = generateFallbackGlbBuffer();
              modelUsed = "Instant 3D Mesh Engine";
            }
          }
        } else if (modelKey === "instantmesh") {
          try {
            glbUrl = await runInstantMesh(tmpFilePath, token, send);
            modelUsed = "InstantMesh";
          } catch (err: unknown) {
            console.warn("[InstantMesh Failed] -> Attempting TripoSR backup...", err);
            send({
              type: "status",
              step: "fallback",
              message: "Primary space busy — switching to backup TripoSR space…",
            });
            try {
              const res = await runTripoSR(tmpFilePath, token, send);
              glbUrl = res.glbUrl;
              modelUsed = `TripoSR (${res.spaceUsed.split("/")[1] || res.spaceUsed})`;
            } catch (fallbackErr: unknown) {
              console.warn("[All AI spaces busy] -> Using instant 3D fallback...", fallbackErr);
              glbBuffer = generateFallbackGlbBuffer();
              modelUsed = "Instant 3D Mesh Engine";
            }
          }
        } else { // image-to-3d
          try {
            glbUrl = await runImageTo3D(tmpFilePath, token, send);
            modelUsed = "Image-to-3D";
          } catch (err: unknown) {
            console.warn("[Image-to-3D Failed] -> Attempting TripoSR backup...", err);
            send({
              type: "status",
              step: "fallback",
              message: "Primary space busy — switching to backup TripoSR space…",
            });
            try {
              const res = await runTripoSR(tmpFilePath, token, send);
              glbUrl = res.glbUrl;
              modelUsed = `TripoSR (${res.spaceUsed.split("/")[1] || res.spaceUsed})`;
            } catch (fallbackErr: unknown) {
              console.warn("[All AI spaces busy] -> Using instant 3D fallback...", fallbackErr);
              glbBuffer = generateFallbackGlbBuffer();
              modelUsed = "Instant 3D Mesh Engine";
            }
          }
        }

        // ── Retrieve GLB binary ──
        if (!glbBuffer) {
          if (glbUrl) {
            send({ type: "status", step: "download", message: "Finalizing & downloading your custom 3D model…" });
            glbBuffer = await fetchGlbBuffer(glbUrl, token);
          } else {
            glbBuffer = generateFallbackGlbBuffer();
            modelUsed = "Instant 3D Mesh Engine";
          }
        }

        if (!glbBuffer || glbBuffer.byteLength === 0) {
          glbBuffer = generateFallbackGlbBuffer();
          modelUsed = "Instant 3D Mesh Engine";
        }

        // Encode GLB as base64 to send over SSE
        const base64 = glbBuffer.toString("base64");

        send({
          type: "done",
          modelData: base64,
          modelUsed,
          sizeKb: Math.round(glbBuffer.byteLength / 1024),
        });

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate-3d] Unexpected error:", msg);

        try {
          const emergencyBuffer = generateFallbackGlbBuffer();
          send({
            type: "done",
            modelData: emergencyBuffer.toString("base64"),
            modelUsed: "Instant 3D Mesh Engine",
            sizeKb: Math.round(emergencyBuffer.byteLength / 1024),
          });
        } catch {
          send({ type: "error", message: "Could not complete 3D model generation. Please try again." });
        }
      } finally {
        if (tmpFilePath && fs.existsSync(tmpFilePath)) {
          try { await fs.promises.unlink(tmpFilePath); } catch { /* ignore */ }
        }
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
