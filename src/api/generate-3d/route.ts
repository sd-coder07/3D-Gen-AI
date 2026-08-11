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

// ── Helper: TripoSR space runner ──
async function runTripoSR(
  spaceId: string,
  tmpFilePath: string,
  token: string,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: `Connecting to ${spaceId} Space…` });

  const client = await withTimeout(
    Client.connect(spaceId, { token: token as `hf_${string}` }),
    30000,
    `Connecting to ${spaceId} timed out.`
  );

  send({ type: "status", step: "preprocess", message: "Step 1 / 2 — Removing background…" });

  const preprocessRes = await withTimeout(
    client.predict("/preprocess", [
      handle_file(tmpFilePath),
      true,
      0.85,
    ]) as Promise<{ data: Array<{ url?: string; path?: string } | null> }>,
    40000,
    "Background removal timed out."
  );

  const processedImg = preprocessRes.data[0];
  if (!processedImg?.url) {
    throw new Error("Preprocessing returned no image.");
  }

  send({ type: "status", step: "generate", message: "Step 2 / 2 — Generating 3D mesh…" });

  const generateRes = await withTimeout(
    client.predict("/generate", [
      { url: processedImg.url },
      256,
    ]) as Promise<{ data: Array<{ url?: string; path?: string } | null> }>,
    55000,
    "TripoSR 3D generation timed out in queue."
  );

  const outputs = generateRes.data;
  const glbFile = outputs[1] ?? outputs[0];
  const glbUrl = glbFile?.url ?? glbFile?.path ?? null;

  if (!glbUrl) throw new Error("TripoSR returned no 3D file.");
  return glbUrl;
}

// ── Helper: Image-to-3D shape runner ──
async function runImageTo3D(
  tmpFilePath: string,
  token: string,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: "Connecting to Image-to-3D Space…" });

  const client = await withTimeout(
    Client.connect("frogleo/Image-to-3D", { token: token as `hf_${string}` }),
    30000,
    "Connecting to Image-to-3D timed out."
  );

  send({ type: "status", step: "generate", message: "Generating 3D mesh shape…" });

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
    60000,
    "Image-to-3D shape generation timed out."
  );

  const dataList = shapeRes.data;
  let glbUrl: string | null = null;

  for (const item of dataList) {
    if (typeof item === "string") {
      if (item.endsWith(".glb")) {
        glbUrl = item.startsWith("http") ? item : `https://frogleo-image-to-3d.hf.space${item.startsWith("/") ? "" : "/"}${item}`;
        break;
      }
    } else if (item && typeof item === "object") {
      const val = (item as { value?: { url?: string; path?: string } }).value;
      if (val?.url?.endsWith(".glb") || val?.path?.endsWith(".glb")) {
        glbUrl = val.url ?? val.path ?? null;
        break;
      }
    }
  }

  if (!glbUrl) throw new Error("Image-to-3D returned no GLB file.");
  return glbUrl;
}

// ── Helper: InstantMesh runner ──
async function runInstantMesh(
  tmpFilePath: string,
  token: string,
  send: (data: Record<string, unknown>) => void
): Promise<string> {
  send({ type: "status", step: "connect", message: "Connecting to InstantMesh Space…" });

  const client = await withTimeout(
    Client.connect("TencentARC/InstantMesh", { token: token as `hf_${string}` }),
    30000,
    "Connecting to InstantMesh timed out."
  );

  send({ type: "status", step: "preprocess", message: "Step 1 / 2 — Preprocessing image…" });

  const pRes = await withTimeout(
    client.predict("/preprocess", [
      handle_file(tmpFilePath),
      true,
    ]) as Promise<{ data: Array<{ url?: string; path?: string } | null> }>,
    40000,
    "InstantMesh preprocessing timed out."
  );

  const pImg = pRes.data[0];
  if (!pImg?.url) throw new Error("InstantMesh preprocessing failed.");

  send({ type: "status", step: "generate", message: "Step 2 / 2 — Generating multi-view 3D mesh…" });

  const mvsRes = await withTimeout(
    client.predict("/generate_mvs", [
      { url: pImg.url },
      30,
      42,
    ]) as Promise<{ data: Array<{ url?: string; path?: string } | null> }>,
    60000,
    "InstantMesh generation timed out."
  );

  const outputs = mvsRes.data;
  const glbFile = outputs[0];
  const glbUrl = glbFile?.url ?? glbFile?.path ?? null;

  if (!glbUrl) throw new Error("InstantMesh returned no 3D file.");
  return glbUrl;
}

export async function POST(request: NextRequest) {
  const HF_TOKEN = process.env.HF_TOKEN;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(sseEncode(data)); } catch { /* closed */ }
      };

      let tmpFilePath: string | null = null;

      try {
        // ── Validate token ──
        if (!HF_TOKEN || HF_TOKEN === "hf_your_token_here") {
          send({ type: "error", message: "HF_TOKEN not configured in .env.local." });
          controller.close();
          return;
        }

        // ── Parse form ──
        const formData = await request.formData();
        const imageFile = formData.get("image") as File | null;
        const modelKey  = (formData.get("model") as string) || "triposr";

        if (!imageFile) {
          send({ type: "error", message: "No image provided." });
          controller.close();
          return;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
          send({ type: "error", message: "Unsupported file type. Use JPG, PNG or WEBP." });
          controller.close();
          return;
        }
        if (imageFile.size > 10 * 1024 * 1024) {
          send({ type: "error", message: "Image too large. Max 10 MB." });
          controller.close();
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
            glbUrl = await runTripoSR("stabilityai/TripoSR", tmpFilePath, HF_TOKEN, send);
            modelUsed = "stabilityai/TripoSR";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[TripoSR Primary Failed]:", msg, "-> Attempting Image-to-3D fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary GPU queue busy — switching to fast backup AI model space…",
            });
            glbUrl = await runImageTo3D(tmpFilePath, HF_TOKEN, send);
            modelUsed = "frogleo/Image-to-3D (Fallback)";
          }
        } else if (modelKey === "instantmesh") {
          try {
            glbUrl = await runInstantMesh(tmpFilePath, HF_TOKEN, send);
            modelUsed = "TencentARC/InstantMesh";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[InstantMesh Primary Failed]:", msg, "-> Attempting Image-to-3D fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary GPU space busy — switching to fast backup AI model space…",
            });
            glbUrl = await runImageTo3D(tmpFilePath, HF_TOKEN, send);
            modelUsed = "frogleo/Image-to-3D (Fallback)";
          }
        } else { // image-to-3d
          try {
            glbUrl = await runImageTo3D(tmpFilePath, HF_TOKEN, send);
            modelUsed = "frogleo/Image-to-3D";
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[Image-to-3D Primary Failed]:", msg, "-> Attempting TripoSR fallback...");
            send({
              type: "status",
              step: "fallback",
              message: "Primary space busy — switching to backup TripoSR space…",
            });
            glbUrl = await runTripoSR("stabilityai/TripoSR", tmpFilePath, HF_TOKEN, send);
            modelUsed = "stabilityai/TripoSR (Fallback)";
          }
        }

        // ── Download GLB binary ──
        if (!glbUrl) {
          send({ type: "error", message: "AI Spaces were unable to return a 3D model. Please try again in 30 seconds." });
          controller.close();
          return;
        }

        send({ type: "status", step: "download", message: "Downloading 3D model…" });

        const glbResp = await fetch(glbUrl, {
          headers: { Authorization: `Bearer ${HF_TOKEN}` },
        });

        if (!glbResp.ok) {
          send({ type: "error", message: `Could not fetch GLB file (HTTP ${glbResp.status}).` });
          controller.close();
          return;
        }

        const glbBuffer = await glbResp.arrayBuffer();
        if (glbBuffer.byteLength === 0) {
          send({ type: "error", message: "Generated 3D model file is empty." });
          controller.close();
          return;
        }

        // Encode GLB as base64 to send over SSE
        const base64 = Buffer.from(glbBuffer).toString("base64");

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
          send({ type: "error", message: "The AI Space is starting up — please wait 60 seconds and try again.", retryAfter: 60 });
        } else if (msg.includes("ENOTFOUND")) {
          send({ type: "error", message: "Cannot reach Hugging Face servers. Check network connection.", networkError: true });
        } else {
          send({ type: "error", message: msg });
        }
      } finally {
        if (tmpFilePath && fs.existsSync(tmpFilePath)) {
          try { await fs.promises.unlink(tmpFilePath); } catch { /* ignore */ }
        }
        controller.close();
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
