import { NextRequest } from "next/server";
import { Client, handle_file } from "@gradio/client";
import fs from "fs";
import path from "path";
import os from "os";

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

// ── Helper: Download or read GLB binary buffer ──
async function fetchGlbBuffer(glbUrl: string, token?: string): Promise<Buffer> {
  if (fs.existsSync(glbUrl)) {
    return await fs.promises.readFile(glbUrl);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(glbUrl, { headers });
  if (!res.ok && token) {
    res = await fetch(glbUrl);
  }

  if (!res.ok) {
    throw new Error(`Could not fetch 3D model (HTTP ${res.status}).`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ── Helper: TripoSR space runner ──
async function runTripoSR(
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

  send({ type: "status", step: "preprocess", message: "Step 1 / 2 — Removing background…" });

  const preprocessRes = await withTimeout(
    client.predict("/preprocess", [
      handle_file(tmpFilePath),
      true,
      0.85,
    ]) as Promise<{ data: Array<unknown> }>,
    45000,
    "Background removal timed out."
  );

  const processedImg = preprocessRes.data?.[0];
  if (!processedImg) {
    throw new Error("Preprocessing returned no image.");
  }

  send({ type: "status", step: "generate", message: "Step 2 / 2 — Generating 3D mesh geometry…" });

  const generateRes = await withTimeout(
    client.predict("/generate", [
      processedImg,
      256,
    ]) as Promise<{ data: Array<unknown> }>,
    65000,
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

// ── Helper: InstantMesh runner ──
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

  send({ type: "status", step: "preprocess", message: "Step 1 / 3 — Preprocessing image…" });

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

  send({ type: "status", step: "generate_mvs", message: "Step 2 / 3 — Generating multi-view frame representations…" });

  const mvsRes = await withTimeout(
    client.predict("/generate_mvs", [
      pImg,
      30,
      42,
    ]) as Promise<{ data: Array<unknown> }>,
    65000,
    "InstantMesh multi-view generation timed out."
  );

  const mvsData = mvsRes.data?.[0];
  if (!mvsData) throw new Error("InstantMesh multi-view generation failed.");

  send({ type: "status", step: "make3d", message: "Step 3 / 3 — Reconstructing 3D mesh surface…" });

  const meshRes = await withTimeout(
    client.predict("/make3d", [
      mvsData,
    ]) as Promise<{ data: Array<unknown> }>,
    65000,
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
      30,    // steps
      5.0,   // guidance scale
      42,    // seed
      256,   // octree res
      8000,  // chunks
      10000, // target face count
      true,  // randomize seed
    ]) as Promise<{ data: Array<unknown> }>,
    75000,
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
  const HF_TOKEN = process.env.HF_TOKEN;
  const token = (HF_TOKEN && HF_TOKEN !== "hf_your_token_here") ? HF_TOKEN : undefined;

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
        if (imageFile.size > 15 * 1024 * 1024) {
          send({ type: "error", message: "Image too large. Max 15 MB." });
          return;
        }

        // ── Save image to temporary file ──
        const imageBytes = await imageFile.arrayBuffer();
        const ext = imageFile.type.split("/")[1] || "png";
        tmpFilePath = path.join(os.tmpdir(), `upload_3d_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
        await fs.promises.writeFile(tmpFilePath, Buffer.from(imageBytes));

        let glbUrl: string | null = null;
        let modelUsed = "";

        // ═════════════════ Execute Primary with Auto-Fallback ═════════════════
        if (modelKey === "triposr") {
          try {
            glbUrl = await runTripoSR("stabilityai/TripoSR", tmpFilePath, token, send);
            modelUsed = "stabilityai/TripoSR";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[TripoSR Primary Failed]:", msg, "-> Attempting Image-to-3D fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary GPU queue busy — switching to fast backup AI space…",
            });
            glbUrl = await runImageTo3D(tmpFilePath, token, send);
            modelUsed = "frogleo/Image-to-3D (Fallback)";
          }
        } else if (modelKey === "instantmesh") {
          try {
            glbUrl = await runInstantMesh(tmpFilePath, token, send);
            modelUsed = "TencentARC/InstantMesh";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[InstantMesh Primary Failed]:", msg, "-> Attempting Image-to-3D fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary GPU space busy — switching to fast backup AI space…",
            });
            glbUrl = await runImageTo3D(tmpFilePath, token, send);
            modelUsed = "frogleo/Image-to-3D (Fallback)";
          }
        } else { // image-to-3d
          try {
            glbUrl = await runImageTo3D(tmpFilePath, token, send);
            modelUsed = "frogleo/Image-to-3D";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[Image-to-3D Primary Failed]:", msg, "-> Attempting TripoSR fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary space busy — switching to backup TripoSR space…",
            });
            glbUrl = await runTripoSR("stabilityai/TripoSR", tmpFilePath, token, send);
            modelUsed = "stabilityai/TripoSR (Fallback)";
          }
        }

        // ── Retrieve GLB binary ──
        if (!glbUrl) {
          send({ type: "error", message: "AI Spaces were unable to return a 3D model. Please try again." });
          return;
        }

        send({ type: "status", step: "download", message: "Finalizing and downloading 3D model asset…" });

        const glbBuffer = await fetchGlbBuffer(glbUrl, token);

        if (glbBuffer.byteLength === 0) {
          send({ type: "error", message: "Generated 3D model file is empty." });
          return;
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
        console.error("[generate-3d] Error:", msg);

        if (msg.toLowerCase().includes("sleeping") || msg.toLowerCase().includes("building")) {
          send({ type: "error", message: "The AI Space is starting up — please try again in 30 seconds.", retryAfter: 30 });
        } else if (msg.includes("ENOTFOUND")) {
          send({ type: "error", message: "Cannot reach Hugging Face servers. Check your internet connection.", networkError: true });
        } else {
          send({ type: "error", message: msg });
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

