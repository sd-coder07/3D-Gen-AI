"use client";

import React, { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import UploadZone from "@/components/UploadZone";
import LoadingOverlay from "@/components/LoadingOverlay";
import DownloadPanel from "@/components/DownloadPanel";

// Dynamically import Three.js 3D Hero Canvas and Model Viewer
const Hero3DCanvas = dynamic(() => import("@/components/Hero3DCanvas"), {
  ssr: false,
});

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="viewer-ssr-placeholder">
      <div className="loading-ring" style={{ width: 32, height: 32, borderWidth: 2 }} />
      <span>Initializing 3D Viewport…</span>
    </div>
  ),
});

type AppState = "idle" | "generating" | "result" | "error";

interface ModelConfig {
  key: string;
  name: string;
  desc: string;
  badge: string;
  speed: string;
}

const MODELS: ModelConfig[] = [
  { key: "triposr", name: "TripoSR", desc: "Ultra Fast • MIT Licensed • Open Source", badge: "Recommended", speed: "~10s" },
  { key: "instantmesh", name: "InstantMesh", desc: "Multi-View • High Detail Geometry", badge: "High Quality", speed: "~25s" },
  { key: "image-to-3d", name: "Image-to-3D", desc: "Shape Generator • Automatic UV Maps", badge: "Fast Shape", speed: "~20s" },
];

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("triposr");
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [retryAfter, setRetryAfter] = useState<number>(0);
  const [networkError, setNetworkError] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("Connecting to AI Engine…");
  const [queueInfo, setQueueInfo] = useState<{ position: number; step: string; eta?: number | null } | null>(null);

  const generatorRef = useRef<HTMLDivElement>(null);
  const glbBlobRef = useRef<Blob | null>(null);

  const handleImageSelect = useCallback((file: File, url: string) => {
    setImageFile(file);
    setPreviewUrl(url);
    setAppState("idle");
    setErrorMsg("");
    setNetworkError(false);
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setAppState("idle");
    setErrorMsg("");
    setNetworkError(false);
  }, [previewUrl]);

  const scrollToGenerator = () => {
    generatorRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleGenerate = useCallback(async () => {
    if (!imageFile) return;

    setAppState("generating");
    setErrorMsg("");
    setNetworkError(false);
    setRetryAfter(0);
    setLoadingMessage("Connecting to AI Engine…");
    setQueueInfo(null);

    try {
      const form = new FormData();
      form.append("image", imageFile);
      form.append("model", selectedModel);

      const response = await fetch("/api/generate-3d", { method: "POST", body: form });

      if (!response.body) throw new Error("No response stream from server.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          switch (event.type) {
            case "status":
              setLoadingMessage((event.message as string) ?? "");
              break;

            case "queue":
              setQueueInfo({
                position: event.position as number,
                step: event.step as string,
                eta: (event.eta as number | null | undefined) ?? null,
              });
              setLoadingMessage((event.message as string) ?? "");
              break;

            case "done": {
              const b64 = event.modelData as string;
              const bin = atob(b64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const blob = new Blob([bytes], { type: "model/gltf-binary" });
              if (glbUrl) URL.revokeObjectURL(glbUrl);
              const newGlbUrl = URL.createObjectURL(blob);
              setGlbUrl(newGlbUrl);
              setModelUsed((event.modelUsed as string) ?? "");
              setQueueInfo(null);
              setAppState("result");
              break;
            }

            case "error":
              setRetryAfter((event.retryAfter as number) ?? 0);
              if (event.networkError) setNetworkError(true);
              throw new Error((event.message as string) ?? "Unknown error.");
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error.";
      setErrorMsg((prev) => prev || msg);
      setAppState((prev) => prev === "result" ? "result" : "error");
    }
  }, [imageFile, selectedModel, glbUrl]);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (glbUrl) URL.revokeObjectURL(glbUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setGlbUrl(null);
    setAppState("idle");
    setErrorMsg("");
    setRetryAfter(0);
    setNetworkError(false);
    setLoadingMessage("Connecting to AI Engine…");
    setQueueInfo(null);
    glbBlobRef.current = null;
  }, [previewUrl, glbUrl]);

  const selectedModelLabel =
    MODELS.find((m) => m.key === selectedModel)?.name ?? selectedModel;

  const needsToken = errorMsg.toLowerCase().includes("token");

  return (
    <div className="emerald-theme-layout">
      {/* ── Header Navbar ── */}
      <header className="scope-header">
        <div className="header-container">
          {/* Logo Left */}
          <a href="/" className="scope-logo">
            <svg className="scope-logo-icon" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="2" />
              <ellipse cx="18" cy="18" rx="14" ry="6" stroke="currentColor" strokeWidth="1.5" transform="rotate(30 18 18)" />
              <ellipse cx="18" cy="18" rx="14" ry="6" stroke="currentColor" strokeWidth="1.5" transform="rotate(-30 18 18)" />
            </svg>
            <span className="scope-logo-text">3DGen AI</span>
          </a>

          {/* Navigation Links Center */}
          <nav className="scope-nav">
            <a href="#" className="nav-link active">Home</a>
            <a href="#generator-section" className="nav-link" onClick={(e) => { e.preventDefault(); scrollToGenerator(); }}>Generator</a>
            <a href="#models-section" className="nav-link">AI Models</a>
            <a href="#features-section" className="nav-link">Features</a>
            <a href="#rewards-section" className="nav-link">Formats</a>
          </nav>

          {/* Action Button Right */}
          <div className="header-actions">
            <button className="pill-btn-white" onClick={scrollToGenerator}>
              <span>Try For Free</span>
              <span className="pill-arrow-icon">→</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Hero Section (Reference Layout) ── */}
      <section className="scope-hero-section">
        {/* Background 3D Torus Sculptural Canvas */}
        <Hero3DCanvas />

        <div className="hero-content-grid">
          {/* Left Column: Big Headlines & CTA */}
          <div className="hero-left-col">
            <h1 className="hero-giant-title">
              <span className="title-row">Magic</span>
              <span className="title-row">From 3D</span>
            </h1>

            <p className="hero-scope-subtitle">
              We propose to create 3Ds with the help of AI and to animate them immediately. Upload any 2D photo and instantly extract textured 3D meshes.
            </p>

            <div className="hero-cta-wrap">
              <button className="pill-btn-white hero-main-btn" onClick={scrollToGenerator}>
                <span>Try For Free</span>
              </button>
            </div>

            {/* Bottom Left Info Rows */}
            <div className="hero-info-rows">
              <a href="#generator-section" className="info-row-item" onClick={(e) => { e.preventDefault(); scrollToGenerator(); }}>
                <span>How to work with our AI generator</span>
                <span className="row-arrow">↗</span>
              </a>
              <a href="#features-section" className="info-row-item">
                <span>Supported 3D formats (GLB / glTF 2.0)</span>
                <span className="row-arrow">↗</span>
              </a>
            </div>
          </div>

          {/* Right Column: Social Links & Work Preview Card */}
          <div className="hero-right-col">
            <div className="social-follow-box">
              <span className="social-label">Follow us on social networks</span>
              <div className="social-icons">
                <a href="#" className="social-icon-pill" aria-label="Facebook">f</a>
                <a href="#" className="social-icon-pill" aria-label="Discord">👾</a>
                <a href="#" className="social-icon-pill" aria-label="Instagram">📷</a>
                <a href="#" className="social-icon-pill" aria-label="X">𝕏</a>
              </div>
            </div>

            {/* Bottom Right Floating Preview Card */}
            <div className="hero-work-card" onClick={scrollToGenerator} role="button" tabIndex={0}>
              <div className="card-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/sample_3d_work.png"
                  alt="3D Model Sample Render"
                  className="card-3d-render-img"
                />
                <button className="card-arrow-circle" aria-label="View sample works">↗</button>
              </div>
              <p className="card-title">View sample works</p>
            </div>
          </div>

          {/* Giant Bottom Headline Right */}
          <div className="hero-bottom-right-title">
            <span className="title-row">With Us</span>
          </div>
        </div>
      </section>

      {/* ── Loading Overlay ── */}
      {appState === "generating" && (
        <LoadingOverlay
          modelName={selectedModelLabel}
          message={loadingMessage}
          queueInfo={queueInfo}
        />
      )}

      {/* ── Generator & Upload Section ── */}
      {(appState === "idle" || appState === "error") && (
        <main className="upload-section-wrap" id="generator-section" ref={generatorRef}>
          <div className="emerald-panel-card">
            <div className="panel-header">
              <span className="panel-tag">AI 3D RECONSTRUCTION ENGINE</span>
              <h2 className="panel-title">Upload Photo & Select Model</h2>
            </div>

            {/* Upload Zone */}
            <UploadZone
              onImageSelect={handleImageSelect}
              previewUrl={previewUrl}
              onRemove={handleRemoveImage}
            />

            {/* Model Selector */}
            <div id="models-section" className="model-selector-container">
              <div className="model-selector-header">
                <span className="selector-title">Select AI Model</span>
                <span className="selector-subtitle">Hugging Face ZeroGPU</span>
              </div>

              <div className="model-select-wrap" role="radiogroup" aria-label="AI model selection">
                {MODELS.map((m) => (
                  <button
                    key={m.key}
                    id={`model-${m.key}`}
                    role="radio"
                    aria-checked={selectedModel === m.key}
                    className={`model-chip ${selectedModel === m.key ? "selected" : ""}`}
                    onClick={() => setSelectedModel(m.key)}
                  >
                    <div className="model-chip-top">
                      <span className="model-chip-name">{m.name}</span>
                      <span className="model-chip-speed">{m.speed}</span>
                    </div>
                    <div className="model-chip-desc">{m.desc}</div>
                    {selectedModel === m.key && (
                      <div className="model-chip-badge">✓ {m.badge}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Card */}
            {appState === "error" && errorMsg && (
              <div className="error-card" role="alert">
                <div className="error-icon" aria-hidden="true">
                  {networkError ? "🌐" : "⚠️"}
                </div>
                <div className="error-content">
                  <p className="error-title">
                    {networkError ? "Network Connection Error" : "Generation Alert"}
                  </p>
                  <p className="error-msg">{errorMsg}</p>

                  {retryAfter > 0 && (
                    <p className="retry-hint">
                      Please wait {retryAfter}s and try again (Space initializing)
                    </p>
                  )}
                  {needsToken && (
                    <div className="token-warning">
                      <span>🔑 Add your free HuggingFace token in <code>frontend/.env.local</code> as <code>HF_TOKEN=hf_…</code></span>
                      <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">Get Free Token →</a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generate Pill CTA Button */}
            <div className="generate-btn-wrap">
              <button
                id="generate-btn"
                className={`pill-btn-white generate-main-btn ${imageFile ? "active" : ""}`}
                onClick={handleGenerate}
                disabled={!imageFile}
                aria-label="Generate 3D model from uploaded image"
              >
                <span>{imageFile ? `Generate 3D Model with ${selectedModelLabel}` : "Upload an Image First"}</span>
                <span className="pill-arrow-icon">↓</span>
              </button>
            </div>
          </div>

          {/* Features Section */}
          <section className="features-grid" id="features-section" aria-label="Key Capabilities">
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="feature-title">Instant 3D Reconstruction</h3>
              <p className="feature-desc">Converts single 2D images into textured 3D meshes using neural radiance & implicit shape AI networks.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <h3 className="feature-title">PBR Textures & UV Maps</h3>
              <p className="feature-desc">Automatically generates UV unwrapping and extracts high-fidelity vertex color & surface material maps.</p>
            </div>
            <div className="feature-card" id="rewards-section">
              <div className="feature-icon">🎮</div>
              <h3 className="feature-title">Universal Engine Format</h3>
              <p className="feature-desc">Exports standard GLB (glTF 2.0) files ready for Blender, Unity 3D, Unreal Engine 5, & WebGL viewers.</p>
            </div>
          </section>
        </main>
      )}

      {/* ── Result Section ── */}
      {appState === "result" && glbUrl && (
        <main className="result-section" id="main-content">
          {/* 3D Viewer */}
          <section className="viewer-wrap" aria-label="3D model viewer">
            <div className="viewer-topbar">
              <span className="viewer-title">
                <span className="viewer-live-dot" aria-hidden="true" />
                3D Interactive Viewport — {selectedModelLabel}
              </span>
              <span className="viewer-controls-hint">
                Orbit: Left Drag · Zoom: Scroll · Pan: Right Drag
              </span>
            </div>
            <ModelViewer glbUrl={glbUrl} />
          </section>

          {/* Info + Downloads */}
          <DownloadPanel
            glbUrl={glbUrl}
            modelUsed={modelUsed}
            onReset={handleReset}
          />
        </main>
      )}

      {/* ── Footer ── */}
      <footer className="scope-footer">
        <div className="footer-container">
          <p className="footer-text">
            Powered by{" "}
            <a href="https://huggingface.co" className="footer-link" target="_blank" rel="noopener noreferrer">Hugging Face ZeroGPU</a>
            {" "}·{" "}
            <a href="https://threejs.org" className="footer-link" target="_blank" rel="noopener noreferrer">Three.js WebGL</a>
            {" "}· Open Source AI Models (TripoSR · InstantMesh · Image-to-3D)
          </p>
          <p className="footer-subtext">
            © 2026 3DGen AI — All rights reserved. 3D models reconstructed via neural AI networks.
          </p>
        </div>
      </footer>
    </div>
  );
}
