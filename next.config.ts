import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // Allow images from any domain (for future use)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Use empty turbopack config — Next.js 16 defaults to Turbopack
  turbopack: {},
};

export default nextConfig;
