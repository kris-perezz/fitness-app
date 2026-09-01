import { ImageResponse } from "next/og";
import { DumbbellMark } from "@/lib/dumbbell-icon";

// Apple's home-screen icon. iOS ignores the manifest's icons for Add to Home
// Screen and reads apple-touch-icon instead, so this is the one that shows up
// on an iPhone.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<DumbbellMark size={180} />, size);
}
