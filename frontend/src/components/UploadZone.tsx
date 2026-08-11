"use client";

import React, { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onImageSelect: (file: File, previewUrl: string) => void;
  previewUrl: string | null;
  onRemove: () => void;
}

interface PresetSample {
  name: string;
  icon: string;
  url: string;
}

const PRESETS: PresetSample[] = [
  { name: "Sword", icon: "⚔️", url: "https://raw.githubusercontent.com/gradio-app/gradio/main/test/test_files/bus.png" },
  { name: "Helmet", icon: "🪖", url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80" },
  { name: "Chair", icon: "🪑", url: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=400&q=80" },
  { name: "Car", icon: "🚗", url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80" },
  { name: "Statue", icon: "🗿", url: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80" },
];

export default function UploadZone({
  onImageSelect,
  previewUrl,
  onRemove,
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      onImageSelect(file, url);
    },
    [onImageSelect]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const openPicker = () => inputRef.current?.click();

  const handleSelectPreset = async (preset: PresetSample) => {
    setLoadingPreset(preset.name);
    try {
      const resp = await fetch(preset.url);
      const blob = await resp.blob();
      const file = new File([blob], `${preset.name.toLowerCase()}.png`, { type: blob.type || "image/png" });
      handleFile(file);
    } catch {
      // ignore
    } finally {
      setLoadingPreset(null);
    }
  };

  return (
    <div className="upload-container">
      <div
        id="upload-zone"
        className={`upload-zone ${dragging ? "dragging" : ""} ${previewUrl ? "has-image" : ""}`}
        onClick={!previewUrl ? openPicker : undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Upload image"
        onKeyDown={(e) => e.key === "Enter" && !previewUrl && openPicker()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={onInputChange}
          id="file-input"
          aria-label="Select image file"
        />

        {previewUrl ? (
          <div className="preview-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Uploaded preview"
              className="preview-image"
            />
            <button
              className="preview-remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Remove image"
              title="Remove image"
            >
              ✕
            </button>
            <div className="preview-badge-status">
              <span className="live-dot" /> Image ready for 3D generation
            </div>
          </div>
        ) : (
          <>
            <div className="upload-icon-pulse-wrap" aria-hidden="true">
              <div className="upload-icon-inner">✨</div>
            </div>
            <p className="upload-title">
              {dragging ? "Release to drop image" : "Drag & drop your photo, or click to browse"}
            </p>
            <p className="upload-sub">
              Upload any photo — character, weapon, vehicle, furniture, or sculpture
            </p>
            <div className="upload-formats" aria-label="Accepted formats">
              <span className="upload-format-tag">PNG</span>
              <span className="upload-format-tag">JPG</span>
              <span className="upload-format-tag">WEBP</span>
              <span className="upload-format-tag">Up to 10MB</span>
            </div>
          </>
        )}
      </div>

      {/* Preset Samples Selector */}
      {!previewUrl && (
        <div className="presets-wrapper">
          <p className="presets-title">Or test with a sample image:</p>
          <div className="presets-grid">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className={`preset-pill ${loadingPreset === p.name ? "loading" : ""}`}
                onClick={() => handleSelectPreset(p)}
                disabled={loadingPreset != null}
              >
                <span className="preset-icon">{p.icon}</span>
                <span className="preset-name">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
