import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { StrawberryOrbs } from "@/components/strawberry-orbs";
import { ThemeColor } from "@/components/theme-color";
import { TimeZoneCookie } from "@/components/time-zone-cookie";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { OPEN_WORKOUT_COOKIE } from "@/lib/open-workout-cookie";
import { StartupSplash } from "@/components/startup-splash";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Matches the manifest's `name`, so the browser tab, the Add to Home Screen
  // prompt and the installed app all say the same thing.
  title: "Jacked AF",
  description: "Food and training log",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and the home indicator. This is a contract: anything
  // anchored to the bottom of the screen must inset itself with
  // env(safe-area-inset-bottom), or it lands under the gesture bar.
  viewportFit: "cover",
  // Without this iOS paints the strip above and below the page white, whatever
  // the app is doing. These answer the SYSTEM preference; components/theme-color.tsx
  // takes over once a theme is chosen by hand.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // Shrink the layout viewport when the keyboard opens instead of covering the
  // page, so dvh-sized sheets keep their action row reachable while typing.
  interactiveWidget: "resizes-content",
  // Deliberately no maximumScale/userScalable: blocking pinch-zoom fails
  // WCAG 1.4.4. Inputs are all 16px, which is what actually stops iOS
  // zooming on focus.
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const openWorkoutId = (await cookies()).get(OPEN_WORKOUT_COOKIE)?.value ?? null;

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <ThemeColor />
          <TimeZoneCookie />
          <StrawberryOrbs />
          <StartupSplash />
          {/* md:pl-20 clears the desktop rail BottomNav draws at that width --
              one offset here rather than one in every screen's own PAGE
              container, so a screen that forgets it is not a screen that
              renders under the rail. */}
          <div className="flex min-h-full flex-1 flex-col md:pl-20">{children}</div>
          <BottomNav openWorkoutId={openWorkoutId} />
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
