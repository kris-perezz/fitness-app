"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TIME_ZONE_COOKIE } from "@/lib/time-zone-cookie.shared";

/**
 * Tell the server which timezone this device is in.
 *
 * The server decides what "today" is -- it anchors the log, it dates the row
 * `saveGoals` writes, it is what `saveWeighIn` refuses to write past -- and on
 * Vercel its own clock is UTC. Geo-IP covers the first render; this is the
 * device's own answer, which outranks it and survives a VPN.
 *
 * Refreshes only when the value CHANGES. Writing the same cookie on every mount
 * and refreshing after it would put a server round trip on every page load to
 * learn something that has not moved since the last one.
 */
export function TimeZoneCookie() {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;

    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current === zone) return;

    // A year, so an installed app does not re-learn this every session, and
    // Lax rather than Strict: the cookie has to be present on the first
    // navigation in from anywhere, which is exactly when it matters most.
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
