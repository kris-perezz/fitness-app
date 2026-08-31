import type { MetadataRoute } from "next";

/**
 * Without a manifest, "Add to Home Screen" produces a bookmark that opens in a
 * browser tab. `display: standalone` is what makes it launch as an app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jacked AF",
    short_name: "Jacked",
    description: "Food and training log",
    start_url: "/log",
    display: "standalone",
    orientation: "portrait",
    // Matches --background in globals.css for light and dark respectively, so
    // the splash and status bar do not flash a colour the app never uses.
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // Served by app/icon.tsx, which generates the PNG at build time.
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
