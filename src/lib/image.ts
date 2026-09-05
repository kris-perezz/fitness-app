/**
 * Client-side photo downscaling.
 *
 * A phone camera hands over a 3-5 MB JPEG, and a base64 data URL is a third
 * larger again. That does not survive a server action's request body limit, and
 * uploading it over mobile data in a gym or a shop is the slowest part of the
 * whole flow.
 *
 * The same path serves a photo taken now and one picked out of the camera roll.
 *
 * A nutrition panel is small dense text, so this trades resolution carefully:
 * 1600px on the long edge keeps the digits legible to a vision model while
 * bringing a typical photo under a few hundred kilobytes.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/**
 * A server action's request body is capped at 1 MB and the encoded photo is
 * nearly all of it, so the budget sits under the cap with room for the rest of
 * the payload. A detailed frame -- a plate rather than a flat panel -- is what
 * reaches it, and going over is not a message on screen: the action rejects and
 * takes the page down with it.
 */
const MAX_DATA_URL = 900_000;

/** Tried in order once the first encode is too big. Quality before resolution:
 * JPEG artefacts cost the model less than losing the strokes of a digit. */
const FALLBACKS: [edge: number, quality: number][] = [
  [MAX_EDGE, 0.7],
  [MAX_EDGE, 0.55],
  [1200, 0.6],
  [1000, 0.5],
];

/** Rejects only if the file is not a decodable image. */
export async function downscaleToDataUrl(file: File): Promise<string> {
  // A photo out of the camera roll is usually stored unrotated with an EXIF
  // orientation tag beside it, and drawing it to a canvas is what drops that
  // tag -- a sideways panel is measurably harder for the model to read. The
  // spec's default is "from-image", but stating it keeps older engines honest.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  try {
    let encoded = encode(bitmap, MAX_EDGE, QUALITY);
    for (const [edge, quality] of FALLBACKS) {
      if (encoded.length <= MAX_DATA_URL) break;
      encoded = encode(bitmap, edge, quality);
    }
    return encoded;
  } finally {
    // Bitmaps hold decoded pixels outside the JS heap; on a phone, leaking one
    // per photo is a real amount of memory.
    bitmap.close();
  }
}

function encode(bitmap: ImageBitmap, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
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

  return canvas.toDataURL("image/jpeg", quality);
}
