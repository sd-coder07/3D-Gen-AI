"use client";

import React from "react";

interface QueueInfo {
  position: number;
  step: string;
  eta?: number | null;
}

interface LoadingOverlayProps {
  modelName: string;
  message?: string;
  queueInfo?: QueueInfo | null;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)}min`;
}

export default function LoadingOverlay({ modelName, message, queueInfo }: LoadingOverlayProps) {
  const isQueued = queueInfo != null && queueInfo.position > 0;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      {/* Spinner */}
      <div className="loading-ring" aria-hidden="true" />

      {/* Dots */}
      <div className="loading-pulse-dots" aria-hidden="true">
        <span /><span /><span />
      </div>

      {/* Title */}
      <p className="loading-title">Generating your 3D model…</p>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "-0.25rem" }}>
        Using <strong style={{ color: "var(--accent-end)" }}>{modelName}</strong>
      </p>

      {/* Queue Badge */}
      {isQueued && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.75rem 1.5rem",
            borderRadius: "var(--radius-md)",
            background: "rgba(124, 58, 237, 0.12)",
            border: "1px solid var(--border-accent)",
            minWidth: 220,
          }}
          aria-label={`Queue position ${queueInfo.position + 1}`}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            In GPU Queue
          </span>
          <span style={{
            fontSize: "2rem",
            fontWeight: 800,
            fontFamily: "Space Grotesk, sans-serif",
            color: "var(--accent-end)",
            lineHeight: 1,
          }}>
            #{queueInfo.position + 1}
          </span>
          {queueInfo.eta != null && queueInfo.eta > 0 && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              Est. wait: {formatEta(queueInfo.eta)}
            </span>
          )}
        </div>
      )}

      {/* Status message */}
      <div style={{
        padding: "0.6rem 1.2rem",
        borderRadius: "var(--radius-md)",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border)",
        minWidth: 260,
        textAlign: "center",
      }}>
        <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}>
          {message || "Connecting to AI Space…"}
        </p>
      </div>

      {/* Cold start notice */}
      <p style={{
        fontSize: "0.72rem",
        color: "var(--text-muted)",
        maxWidth: 280,
        textAlign: "center",
        lineHeight: 1.6,
        marginTop: "0.25rem",
      }}>
        💡 First generation can take <strong style={{ color: "var(--text-secondary)" }}>2–5 minutes</strong>
        {" "}while the GPU Space wakes up. Subsequent runs are faster.
      </p>
    </div>
  );
}
