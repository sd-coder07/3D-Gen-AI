"use client";

import React from "react";

interface DownloadPanelProps {
  glbUrl: string;
  modelUsed: string;
  onReset: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  "stabilityai/TripoSR": "TripoSR",
  "stabilityai/stable-fast-3d": "Stable Fast 3D",
  "microsoft/TRELLIS-image-large": "TRELLIS",
};

export default function DownloadPanel({
  glbUrl,
  modelUsed,
  onReset,
}: DownloadPanelProps) {
  const modelLabel = MODEL_LABELS[modelUsed] || modelUsed;
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = glbUrl;
    link.download = `3dgen-model-${Date.now()}.glb`;
    link.click();
  };

  return (
    <div className="info-panel">
      {/* Model Info Card */}
      <div className="glass-card">
        <p className="card-label">Model Info</p>
        <div className="model-stat-row">
          <span className="model-stat-key">AI Model</span>
          <span className="model-stat-val" style={{ color: "var(--accent-end)" }}>
            {modelLabel}
          </span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">Format</span>
          <span className="model-stat-val">GLB (glTF 2.0)</span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">Generated</span>
          <span className="model-stat-val" style={{ fontSize: "0.72rem" }}>
            {timestamp}
          </span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">Viewer</span>
          <span className="model-stat-val">Three.js WebGL</span>
        </div>
      </div>

      {/* Controls hint */}
      <div className="glass-card">
        <p className="card-label">Viewer Controls</p>
        <div className="model-stat-row">
          <span className="model-stat-key">🖱️ Drag</span>
          <span className="model-stat-val">Rotate</span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">🖱️ Scroll</span>
          <span className="model-stat-val">Zoom</span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">🖱️ Right-drag</span>
          <span className="model-stat-val">Pan</span>
        </div>
        <div className="model-stat-row">
          <span className="model-stat-key">⚡ Auto-rotate</span>
          <span className="model-stat-val" style={{ color: "#4ade80" }}>
            Active
          </span>
        </div>
      </div>

      {/* Downloads */}
      <div className="glass-card">
        <p className="card-label">Download</p>
        <button
          id="download-glb-btn"
          className="btn-download btn-download-primary"
          onClick={handleDownload}
          aria-label="Download 3D model as GLB file"
        >
          ⬇️ Download GLB
        </button>
        <button
          id="download-share-btn"
          className="btn-download btn-download-secondary"
          onClick={() => {
            const text = `I just generated a 3D model from a photo using 3DGen AI! 🤩`;
            if (navigator.share) {
              navigator.share({ title: "3DGen AI", text }).catch(() => {});
            } else {
              navigator.clipboard
                .writeText(text)
                .catch(() => {});
            }
          }}
          aria-label="Share this 3D model"
        >
          🔗 Share
        </button>
      </div>

      {/* Reset */}
      <button
        id="try-another-btn"
        className="btn-try-again"
        onClick={onReset}
        aria-label="Try generating another 3D model"
      >
        ↩ Try Another Image
      </button>
    </div>
  );
}
