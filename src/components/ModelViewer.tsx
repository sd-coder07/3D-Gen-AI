"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface ModelViewerProps {
  glbUrl: string;
}

type LightTheme = "studio" | "cyber" | "dark";

export default function ModelViewer({ glbUrl }: ModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Viewport Control States
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [lightTheme, setLightTheme] = useState<LightTheme>("studio");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    frameId: number;
    model: THREE.Object3D | null;
    hemiLight: THREE.HemisphereLight;
    dirLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
  } | null>(null);

  const cleanup = useCallback(() => {
    if (sceneRef.current) {
      cancelAnimationFrame(sceneRef.current.frameId);
      sceneRef.current.controls.dispose();
      sceneRef.current.renderer.dispose();
      sceneRef.current = null;
    }
  }, []);

  // ── Apply Wireframe toggle ──
  useEffect(() => {
    if (!sceneRef.current?.model) return;
    sceneRef.current.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => { (m as THREE.MeshStandardMaterial).wireframe = isWireframe; });
          } else {
            (mesh.material as THREE.MeshStandardMaterial).wireframe = isWireframe;
          }
        }
      }
    });
  }, [isWireframe]);

  // ── Apply Auto-Rotate toggle ──
  useEffect(() => {
    if (!sceneRef.current?.controls) return;
    sceneRef.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  // ── Apply Light Theme changes ──
  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene, hemiLight, dirLight, fillLight, rimLight } = sceneRef.current;

    if (lightTheme === "cyber") {
      scene.background = new THREE.Color(0x080616);
      scene.fog = new THREE.FogExp2(0x080616, 0.05);
      hemiLight.color.setHex(0xa78bfa);
      hemiLight.groundColor.setHex(0x06b6d4);
      dirLight.color.setHex(0xc084fc);
      fillLight.color.setHex(0x22d3ee);
      rimLight.color.setHex(0xf43f5e);
    } else if (lightTheme === "dark") {
      scene.background = new THREE.Color(0x050508);
      scene.fog = new THREE.FogExp2(0x050508, 0.06);
      hemiLight.color.setHex(0x8888aa);
      hemiLight.groundColor.setHex(0x111122);
      dirLight.color.setHex(0xffffff);
      fillLight.color.setHex(0x6366f1);
      rimLight.color.setHex(0xa855f7);
    } else { // studio
      scene.background = new THREE.Color(0x0d0d24);
      scene.fog = new THREE.FogExp2(0x0d0d24, 0.05);
      hemiLight.color.setHex(0xffffff);
      hemiLight.groundColor.setHex(0x444455);
      dirLight.color.setHex(0xffffff);
      fillLight.color.setHex(0x8b5cf6);
      rimLight.color.setHex(0x22d3ee);
    }
  }, [lightTheme]);

  // ── Initialize Scene ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setLoading(true);
    setLoadError(null);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 520;
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d24);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x2e2e5a, 0x1a1a38);
    (gridHelper.material as THREE.Material).opacity = 0.55;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    scene.fog = new THREE.FogExp2(0x0d0d24, 0.05);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 1.5, 3.5);
    camera.lookAt(0, 0, 0);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8b5cf6, 0.6);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.4);
    rimLight.position.set(0, -3, -5);
    scene.add(rimLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.8;

    // Load GLB Model
    const loader = new GLTFLoader();
    let model: THREE.Object3D | null = null;

    loader.load(
      glbUrl,
      (gltf) => {
        model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.0 / maxDim;

        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale + 0.1, -center.z * scale);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => {
                  m.side = THREE.DoubleSide;
                  (m as THREE.MeshStandardMaterial).wireframe = isWireframe;
                });
              } else {
                mesh.material.side = THREE.DoubleSide;
                (mesh.material as THREE.MeshStandardMaterial).wireframe = isWireframe;
              }
            }
          }
        });

        scene.add(model);
        if (sceneRef.current) sceneRef.current.model = model;
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("[ModelViewer] GLB load error:", err);
        setLoading(false);
        setLoadError("Failed to parse GLB 3D binary.");
      }
    );

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      frameId,
      model,
      hemiLight,
      dirLight,
      fillLight,
      rimLight,
    };

    const handleResize = () => {
      if (!mount || !sceneRef.current) return;
      const { renderer, camera } = sceneRef.current;
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 520;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    return () => {
      ro.disconnect();
      cleanup();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [glbUrl, cleanup]);

  const handleResetCamera = () => {
    if (!sceneRef.current) return;
    sceneRef.current.camera.position.set(0, 1.5, 3.5);
    sceneRef.current.controls.target.set(0, 0, 0);
    sceneRef.current.controls.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`viewer-container ${isFullscreen ? "fullscreen" : ""}`}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: "520px" }}
    >
      {/* ── Interactive Viewport Floating Toolbar ── */}
      <div className="viewer-toolbar" aria-label="3D Viewport Controls">
        <button
          className={`toolbar-btn ${autoRotate ? "active" : ""}`}
          onClick={() => setAutoRotate(!autoRotate)}
          title="Toggle Auto-Rotate"
          aria-label="Toggle Auto-Rotate"
        >
          <span>🔄</span>
          <span className="toolbar-label">Rotate</span>
        </button>

        <button
          className={`toolbar-btn ${isWireframe ? "active" : ""}`}
          onClick={() => setIsWireframe(!isWireframe)}
          title="Toggle Wireframe Mode"
          aria-label="Toggle Wireframe Mode"
        >
          <span>📐</span>
          <span className="toolbar-label">Wireframe</span>
        </button>

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${lightTheme === "studio" ? "active" : ""}`}
          onClick={() => setLightTheme("studio")}
          title="Studio Lighting"
        >
          <span>💡</span>
          <span className="toolbar-label">Studio</span>
        </button>

        <button
          className={`toolbar-btn ${lightTheme === "cyber" ? "active" : ""}`}
          onClick={() => setLightTheme("cyber")}
          title="Cyber Neon Lighting"
        >
          <span>🌆</span>
          <span className="toolbar-label">Cyber</span>
        </button>

        <button
          className={`toolbar-btn ${lightTheme === "dark" ? "active" : ""}`}
          onClick={() => setLightTheme("dark")}
          title="Dark Void Lighting"
        >
          <span>🌙</span>
          <span className="toolbar-label">Void</span>
        </button>

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn"
          onClick={handleResetCamera}
          title="Reset Camera View"
          aria-label="Reset Camera View"
        >
          <span>🎯</span>
          <span className="toolbar-label">Reset</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          aria-label="Toggle Fullscreen"
        >
          <span>⛶</span>
          <span className="toolbar-label">Fullscreen</span>
        </button>
      </div>

      {/* Loading Overlay inside Viewer */}
      {loading && (
        <div className="viewer-loading-overlay">
          <div className="loading-ring" style={{ width: 42, height: 42, borderWidth: 3 }} />
          <p className="viewer-loading-text">Rendering 3D viewport…</p>
        </div>
      )}

      {/* Error Overlay inside Viewer */}
      {loadError && (
        <div className="viewer-error-overlay">
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <p style={{ fontWeight: 600, color: "#f87171" }}>3D Mesh Preview Failed</p>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 300, textAlign: "center" }}>
            {loadError}
          </span>
        </div>
      )}

      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        className="viewer-canvas"
        id="model-viewer-canvas"
        style={{ width: "100%", height: "100%", minHeight: "520px" }}
        aria-label="3D model viewer — drag to rotate, scroll to zoom"
      />
    </div>
  );
}
