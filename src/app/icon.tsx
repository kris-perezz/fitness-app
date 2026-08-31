import { ImageResponse } from "next/og";
import { DumbbellMark } from "@/lib/dumbbell-icon";

// Generated rather than committed as a binary: one definition, no asset
// pipeline, and it stays in step with the palette.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<DumbbellMark size={512} />, size);
}
