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
    background_color: "#f9f7ee",
    theme_color: "#f9f7ee",
    // Served by app/pwa-icon/route.tsx, NOT by app/icon.tsx. The tab icon is a
    // transparent SVG so it does not paint a dark rectangle into the browser
    // chrome; a home-screen tile has to be an opaque square, so it is its own
    // image with the background this app actually uses.
    icons: [
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
