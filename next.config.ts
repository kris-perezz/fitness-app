import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Next blocks cross-origin dev requests by default, which means a phone
  // hitting this machine by LAN address gets a half-working page. Dev only.
  allowedDevOrigins: ["192.168.1.*"],
};

export default nextConfig;
