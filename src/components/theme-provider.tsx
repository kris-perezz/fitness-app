"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * globals.css declares the dark palette behind `@custom-variant dark (&:is(.dark *))`,
 * so the provider must toggle a class -- not the data attribute it defaults to.
 *
 * `themes` has to be given the moment there is a palette beyond the two: without
 * it next-themes only ever writes `light` or `dark`, and a named theme silently
 * resolves to one of them.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={["light", "dark", "strawberry-matcha"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
