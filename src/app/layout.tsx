import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
  title: "Fitness",
  description: "Food and training log",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and the home indicator. This is a contract: anything
  // anchored to the bottom of the screen must inset itself with
  // env(safe-area-inset-bottom), or it lands under the gesture bar.
  viewportFit: "cover",
  // Shrink the layout viewport when the keyboard opens instead of covering the
  // page, so dvh-sized sheets keep their action row reachable while typing.
  interactiveWidget: "resizes-content",
  // Deliberately no maximumScale/userScalable: blocking pinch-zoom fails
  // WCAG 1.4.4. Inputs are all 16px, which is what actually stops iOS
  // zooming on focus.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
