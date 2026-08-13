/**
 * Resizes and compresses an input image file on the client side before uploading.
 * Standardizes dimensions to max 512x512 (ideal input size for TripoSR & 3D models),
 * drastically reducing upload bandwidth (from ~10MB down to ~150KB) and accelerating AI inference.
 */
export async function optimizeImageFor3D(file: File): Promise<File> {
  // If file is already small (< 400KB), return as is
  if (file.size <= 400 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const maxDim = 512;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(file);
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Export as PNG for transparency preservation, or JPEG if JPEG original
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = 0.88;

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const optimizedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, "") + "_opt." + (outputType === "image/png" ? "png" : "jpg"),
            { type: outputType }
          );
          resolve(optimizedFile);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
