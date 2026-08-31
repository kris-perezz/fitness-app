import { PATHS } from "@/lib/dumbbell-icon";

// The browser-tab icon, and the one place this app ships SVG rather than a
// rasterised PNG. Two reasons, and neither applies to the PWA icon:
//
//  1. TRANSPARENCY. A tab icon sits on the browser's own chrome, so a painted
//     background is a dark rectangle in someone else's UI. The PWA icon is the
//     opposite case -- it sits on a home screen and needs to be a solid tile.
//  2. THEME. A transparent icon has to work on a light tab strip AND a dark
//     one, and a PNG cannot know which it is on. An SVG can: the media query
//     below is evaluated by the browser, so the dumbbell is near-black in a
//     light theme and near-white in a dark one. Browsers without SVG favicon
//     support fall back to the stroke attribute on the group, which is the
//     light-theme colour.
//
// The viewBox is cropped to the glyph's own bounds rather than the full 24x24
// grid, which is what makes it read at 16px -- Lucide's artboard has padding
// this does not need, and a tab icon has no maskable safe zone to respect.
export const contentType = "image/svg+xml";

export default function Icon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 1 22 22">
<style>.d{stroke:#0a0a0a}@media(prefers-color-scheme:dark){.d{stroke:#fafafa}}</style>
<g class="d" fill="none" stroke="#0a0a0a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${PATHS.map((d) => `<path d="${d}"/>`).join("\n")}
</g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
