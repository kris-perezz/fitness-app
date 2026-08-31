import { ImageResponse } from "next/og";

// Generated rather than committed as a binary: one definition, no asset
// pipeline, and it stays in step with the palette.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
          // Generous inset so the glyph survives a maskable crop on Android.
          fontSize: 240,
          fontWeight: 700,
          letterSpacing: -8,
        }}
      >
        JA
      </div>
    ),
    size,
  );
}
