# ⬡ 3DGen AI — Image-to-3D Model Generator

> **Turn any 2D photo into a fully textured, interactive 3D model (`.glb`) instantly using AI.**

![3DGen AI Banner](public/sample_3d_work.png)

---

## 🌟 Overview

**3DGen AI** is an open-source, full-stack web application designed to convert 2D images—characters, weapons, vehicles, props, or furniture—into high-quality 3D meshes ready for **Blender**, **Unity**, **Unreal Engine 5**, and **WebGL** applications.

Powered by **Next.js 16 (App Router)**, **Three.js**, and **Hugging Face ZeroGPU AI Spaces**, the platform features a real-time WebGL interactive viewport, sample preset library, and an automated **Multi-Space Failover Engine** ensuring uninterrupted 3D model generation.

---

## ✨ Features

- ⚡ **Instant 3D Reconstruction**: Upload any image (PNG, JPG, WEBP) to generate textured 3D meshes in seconds.
- 🛡️ **Auto-Fallback Engine System**: Built-in multi-endpoint failover automatically switches between Hugging Face spaces (`TripoSR` ➔ `frogleo/Image-to-3D` ➔ `InstantMesh`) if a model space is busy or warming up.
- 🎛️ **Interactive 3D Viewport**: Real-time WebGL canvas powered by Three.js featuring:
  - 🔄 **Auto-Rotate Toggle**
  - 📐 **Wireframe Mode** (Preview underlying mesh geometry)
  - 💡 **Lighting Themes** (Studio, Cyber Neon, Dark Void)
  - 🎯 **Camera Reset & Fullscreen Mode**
- 📦 **Universal GLB Export**: Downloads standard `.glb` (glTF 2.0) binary files complete with textures and UV coordinates.
- 🎨 **Scope Emerald UI Aesthetics**: Styled with glassmorphism, responsive controls, Syne & Space Grotesk typography, and interactive 3D Torus hero centerpiece.
- 🧪 **1-Click Sample Library**: Test generation instantly using built-in sample presets (Sword, Helmet, Chair, Car, Statue).

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **3D Graphics**: [Three.js WebGL Renderer](https://threejs.org/)
- **AI Integration**: [@gradio/client](https://www.npmjs.com/package/@gradio/client)
- **AI Model Spaces**:
  - [TripoSR](https://huggingface.co/spaces/stabilityai/TripoSR) (Stability AI & Tripo AI)
  - [InstantMesh](https://huggingface.co/spaces/TencentARC/InstantMesh) (Tencent ARC)
  - [Image-to-3D](https://huggingface.co/spaces/frogleo/Image-to-3D)
- **Styling**: Custom Vanilla CSS with modern Glassmorphism and CSS variables

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm** or **yarn** or **pnpm**
- Free **Hugging Face Access Token** (Optional but recommended for higher rate limits)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/3D-model-Generator.git
   cd 3D-model-Generator/frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file inside the `frontend` folder:
   ```env
   HF_TOKEN=hf_your_free_huggingface_token_here
   ```
   *(Get your free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens))*

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to view the app!

---

## 🏗️ Project Structure

```
3D-model-Generator/
├── frontend/
│   ├── public/
│   │   ├── sample_3d_work.png       # Generated hero artwork asset
│   │   └── favicon.ico
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── generate-3d/
│   │   │   │       └── route.ts     # Multi-Space Failover SSE API Endpoint
│   │   │   ├── globals.css          # Scope Emerald Design System & Glassmorphism
│   │   │   ├── layout.tsx           # Google Fonts & Root Layout
│   │   │   └── page.tsx             # Main App Page & Hero Section
│   │   └── components/
│   │       ├── DownloadPanel.tsx    # GLB Model Download & Info Card
│   │       ├── Hero3DCanvas.tsx     # Interactive 3D Torus Hero Canvas
│   │       ├── LoadingOverlay.tsx   # SSE Queue & Generation Status Overlay
│   │       ├── ModelViewer.tsx      # Three.js Interactive 3D Viewport
│   │       └── UploadZone.tsx       # Drag-and-Drop & Sample Preset Picker
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
└── README.md
```

---

## ⚡ API Architecture

The application uses a Server-Sent Events (SSE) streaming API at `/api/generate-3d`:

- **Input**: `FormData` containing `image` file and `model` key.
- **Failover Logic**:
  1. Attempts `TripoSR` prediction endpoint.
  2. If `TripoSR` fails or times out, automatically falls back to `frogleo/Image-to-3D`.
  3. If selected model is `InstantMesh`, calls InstantMesh multi-view reconstruction with fallback.
- **Output**: Real-time SSE progress events (`status`, `queue`, `done`) returning base64 encoded `.glb` binary data.

---

## 📦 Production Build

To build the project for production deployment:

```bash
cd frontend
npm run build
npm run start
```

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- [Stability AI](https://stability.ai/) for **TripoSR** open-source 3D reconstruction model.
- [Tencent ARC](https://arc.tencent.com/) for **InstantMesh**.
- [Hugging Face](https://huggingface.co/) for hosting AI Spaces & ZeroGPU infrastructure.
- [Three.js](https://threejs.org/) for WebGL rendering library.
