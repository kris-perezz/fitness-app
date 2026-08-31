"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * globals.css declares the dark palette behind `@custom-variant dark (&:is(.dark *))`,
 * so the provider must toggle a class -- not the data attribute it defaults to.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
