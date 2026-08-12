import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // Allow images from any domain
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Set Turbopack root to current project directory
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

