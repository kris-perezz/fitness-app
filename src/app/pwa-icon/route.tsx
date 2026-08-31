import { ImageResponse } from "next/og";
import { DumbbellMark } from "@/lib/dumbbell-icon";

// The installed-app icon, referenced by manifest.ts. A plain route rather than
// the `icon` file convention, because that convention would also put this in
// the browser tab -- and the tab wants the transparent SVG in app/icon.tsx
// instead. Splitting them is the whole point: a home-screen tile must be an
// opaque square, a tab icon must not be.
export const contentType = "image/png";
// Rendered once at build, not per request: the image never varies.
export const dynamic = "force-static";
const SIZE = 512;

export function GET() {
  return new ImageResponse(<DumbbellMark size={SIZE} />, {
    width: SIZE,
    height: SIZE,
  });
}
