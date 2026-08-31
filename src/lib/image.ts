/**
 * Client-side photo downscaling.
 *
 * A phone camera hands over a 3-5 MB JPEG, and a base64 data URL is a third
 * larger again. That does not survive a server action's request body limit, and
 * uploading it over mobile data in a gym or a shop is the slowest part of the
 * whole flow.
 *
 * A nutrition panel is small dense text, so this trades resolution carefully:
 * 1600px on the long edge keeps the digits legible to a vision model while
 * bringing a typical photo under a few hundred kilobytes.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Rejects only if the file is not a decodable image. */
export async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not read that photo.");
    // The panel is text: smoothing on downscale keeps strokes joined rather
    // than aliasing them into gaps.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    // Bitmaps hold decoded pixels outside the JS heap; on a phone, leaking one
    // per photo is a real amount of memory.
    bitmap.close();
  }
}
