/**
 * Resize an image file in-browser for safe storage in Firestore (keep under ~150KB when possible).
 */
export async function fileToResizedJpegDataUrl(
  file: File,
  opts?: { maxEdge?: number; maxBytes?: number },
): Promise<string> {
  const maxEdge = opts?.maxEdge ?? 512;
  const maxBytes = opts?.maxBytes ?? 150_000;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload a JPG or PNG image.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Image must be 2MB or smaller.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read image.");
    ctx.drawImage(bitmap, 0, 0, w, h);

    let quality = 0.88;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > maxBytes * 1.37 && quality > 0.35) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrl.length > maxBytes * 1.37) {
      throw new Error("Image is still too large after compression. Try a smaller file.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
