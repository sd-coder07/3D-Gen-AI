"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Hero3DCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 600;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    mount.appendChild(renderer.domElement);

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    // ── Lighting Setup Matching sample_3d_work.png ──
    // Ambient Deep Emerald Base
    const ambientLight = new THREE.AmbientLight(0x072226, 1.5);
    scene.add(ambientLight);

    // Main Studio Directional Light
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(2, 6, 5);
    scene.add(mainLight);

    // Warm Gold / Ochre Key Light (matching gold render highlights in sample_3d_work.png)
    const goldLight = new THREE.DirectionalLight(0xfbbf24, 4.5);
    goldLight.position.set(-6, -4, 4);
    scene.add(goldLight);

    // Vivid Cyan / Teal Fill Light (matching cyan highlights in sample_3d_work.png)
    const cyanLight = new THREE.DirectionalLight(0x06b6d4, 4.2);
    cyanLight.position.set(6, 6, 4);
    scene.add(cyanLight);

    // Warm Amber Rim Light
    const rimGold = new THREE.PointLight(0xf59e0b, 6, 18);
    rimGold.position.set(-5, 4, -3);
    scene.add(rimGold);

    // Emerald Green Accent Point Light
    const emeraldLight = new THREE.PointLight(0x10b981, 4, 18);
    emeraldLight.position.set(0, -6, 3);
    scene.add(emeraldLight);

    // ── Geometry: High-Density Sculptural Torus Knot ──
    const geometry = new THREE.TorusKnotGeometry(1.38, 0.46, 256, 48, 2, 3);

    // ── Iridescent Physical Material matching sample_3d_work.png ──
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x0e3a40,
      roughness: 0.18,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      iridescence: 0.9,
      iridescenceIOR: 1.65,
      iridescenceThicknessRange: [120, 380],
      sheen: 0.5,
      sheenColor: new THREE.Color(0xfbbf24),
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ── Mouse Interaction ──
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseX = (e.clientX - windowHalfX) * 0.0008;
      mouseY = (e.clientY - windowHalfY) * 0.0008;
    };

    window.addEventListener("mousemove", handleMouseMove);

    // ── Animation Loop ──
    let frameId: number;
    const startTime = performance.now();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsedTime = (performance.now() - startTime) * 0.001;

      // Smooth mouse tracking
      targetX += (mouseX - targetX) * 0.06;
      targetY += (mouseY - targetY) * 0.06;

      mesh.rotation.x = elapsedTime * 0.28 + targetY * 2.2;
      mesh.rotation.y = elapsedTime * 0.38 + targetX * 2.2;
      mesh.position.y = Math.sin(elapsedTime * 0.9) * 0.09;

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize Handler ──
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      ro.disconnect();
      cancelAnimationFrame(frameId);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="hero-3d-canvas-wrap"
      aria-hidden="true"
    />
  );
}
