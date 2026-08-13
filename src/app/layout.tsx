import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3DGen AI — Magic From 3D Model Generator",
  description:
    "We propose to create 3D models with the help of AI instantly from any photo. Upload an image, generate a GLB file, and preview it live in your browser.",
  keywords: [
    "image to 3d",
    "3d model generator",
    "ai 3d",
    "TripoSR",
    "free 3d generator",
    "GLB download",
  ],
  verification: {
    google: "lGh4hvVQCz6I8QQjLh8LI22jjr4aGkhG-s_QJ4RPVz0",
  },
  openGraph: {
    title: "3DGen AI — Magic From 3D Model Generator",
    description: "Create 3D models with the help of AI instantly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <div className="bg-emerald-void" aria-hidden="true" />
        <div className="bg-emerald-gradient" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
