"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Keep `<meta name="theme-color">` on whatever the active theme is.
 *
 * iOS fills the strip above and below the page with this colour, and with no
 * tag at all it fills them white -- which is what put two white bars around a
 * dark app. The static tag in layout.tsx answers the system preference, which is
 * right until somebody picks a theme by hand: a named palette, or dark on a
 * phone set to light. This closes that gap.
 *
 * The value is read from `--theme-color` rather than from `--background`,
 * because the meta tag takes a plain colour and nothing else. It drops oklch()
 * silently, and a dropped value is white again.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue("--theme-color")
      .trim();
    if (!color) return;

    // Both, because Next renders one per colour scheme and iOS honours the tag
    // whose media query currently matches. Leaving the other behind means the
    // old colour comes back the moment the system flips.
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((tag) => {
        tag.content = color;
      });
  }, [resolvedTheme]);

  return null;
}
