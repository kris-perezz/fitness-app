"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, TrendingUp, User, UtensilsCrossed } from "lucide-react";
import { OPEN_WORKOUT_COOKIE } from "@/lib/open-workout-cookie.shared";
import { cn } from "@/lib/utils";

/**
 * `document.cookie` has no change event, so there is nothing to subscribe to
 * -- the point of reading it through `useSyncExternalStore` rather than an
 * effect is not to be notified of a write, it is to have a snapshot function
 * React already calls on every render (a route change included) with no
 * hydration mismatch, since the SSR pass gets `getServerSnapshot` instead of
 * touching `document` at all.
 */
function subscribeToNothing() {
  return () => {};
}

function readOpenWorkoutCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${OPEN_WORKOUT_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Top-level navigation.
 *
 * Four destinations, no action button: a tab bar navigates between sections,
 * and adding food belongs to the section that owns it. On a phone it sits at
 * the bottom, the reachable half of a screen held one-handed; from `md` up
 * there is no thumb to reach for and a bottom bar would cover content on a
 * screen tall enough not to need it, so the SAME four links become a fixed
 * rail down the left edge instead -- one component, one active-tab test, two
 * arrangements of the same `<li>`s picked by breakpoint rather than by JS.
 */
const TABS = [
  // `also` keeps a tab lit on the section's other routes. Recipes are part of
  // Food, not a fifth destination: you go there to define a dish, and the dish
  // then shows up in the food list like anything else (S16).
  { href: "/log", label: "Food", icon: UtensilsCrossed, also: ["/recipes", "/foods"] },
  { href: "/train", label: "Train", icon: Dumbbell, also: [] },
  { href: "/progress", label: "Progress", icon: TrendingUp, also: [] },
  { href: "/goals", label: "Profile", icon: User, also: [] },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: typeof Dumbbell;
  also: readonly string[];
}[];

/** Routes that are not part of the signed-in app shell. */
const CHROMELESS = ["/login", "/auth"];

export function BottomNav({ openWorkoutId: fromServer }: { openWorkoutId?: string | null }) {
  const pathname = usePathname();

  /**
   * `fromServer` is only ever right on the very first paint. This nav is
   * mounted once by the root layout and never remounts on a client-side tab
   * switch, so a prop is a snapshot of whatever the layout's last SERVER
   * render happened to see -- and opening or finishing a session never
   * triggers one of those, it is entirely a client-side navigation plus a
   * cookie write. Reading the cookie live keeps this correct across a
   * session's whole lifetime instead of just its first ten seconds; React
   * re-invokes the snapshot on every render this component takes, and a route
   * change (below) is one -- so the moment you land somewhere else, the NEXT
   * tap of Train already has the right target.
   */
  const openWorkoutId = useSyncExternalStore(
    subscribeToNothing,
    readOpenWorkoutCookie,
    () => fromServer ?? null,
  );

  // Sign-in is not a section, and a nav bar there would offer four dead links.
  if (CHROMELESS.some((route) => pathname.startsWith(route))) return null;

  const items = TABS.map(({ href, label, icon: Icon, also }) => {
    // Prefix match so nested routes keep their tab lit.
    const active =
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      also.some((r: string) => pathname === r || pathname.startsWith(`${r}/`));

    // Train links straight into today's open session rather than through
    // /train, which would otherwise redirect there itself on arrival (S26).
    // Skipping that hop is the only way this link is ever prefetched all the
    // way to real data instead of to a redirect the browser has to follow
    // cold.
    const target = href === "/train" && openWorkoutId ? `/train/${openWorkoutId}` : href;

    return { href, label, Icon, active, target };
  });

  return (
    <nav aria-label="Sections">
      {/* THE PHONE BAR. pb-safe belongs on the PAINTED element, not on the nav
          around it. On the nav it left the home-indicator strip below the bar
          backed by nothing, so page content scrolled through it sharp and
          unobscured -- which reads as broken rather than as translucent. The
          inset is still there; it is now inside the surface doing the
          covering. Gone from `md` up, where the rail below takes over. */}
      <ul
        data-slot="nav-bar"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch justify-around gap-1 border-t border-border bg-background/85 px-2 py-1 pb-safe backdrop-blur-md md:hidden"
      >
        {items.map(({ href, label, Icon, active, target }) => (
          <li key={href} className="flex-1">
            <Link
              href={target}
              // Fetched while you are on another tab, so switching is instant
              // rather than a full server render you sit through. Every tab
              // here is `force-dynamic`, and Next SKIPS prefetching a dynamic
              // route unless it has a loading boundary -- every tab here has
              // its own `loading.tsx`, which is what makes this possible at
              // all, and prefetch={true} is what makes the result reusable,
              // since it stores under the static stale time (five minutes)
              // rather than the dynamic one (zero, meaning never reused).
              //
              // Four tabs means four background fetches per page. They are
              // small, and pre-loading the destination is the entire job of a
              // bottom nav. Production only -- Next does not prefetch in dev.
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                // 44px minimum target, which is the floor on both platforms.
                "relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors active:bg-accent",
                // A dot as well as the colour. Foreground against
                // muted-foreground is one step of grey, which is not enough to
                // find at a glance and nothing at all in greyscale.
                active
                  ? "text-foreground after:absolute after:bottom-0 after:size-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="text-[11px] leading-none font-medium">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* THE DESKTOP RAIL. Fixed down the left edge instead of the bottom: a
          pointer has the whole screen to travel, so there is no reachable
          half to design for, and a rail leaves the vertical span free for
          content a phone would have had to scroll to. `page-shell.tsx` is
          what actually reserves the width this occupies -- this file only
          draws the rail, on top of it. */}
      <ul
        data-slot="nav-rail"
        className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-stretch gap-1 border-r border-border bg-background/85 p-2 pt-4 backdrop-blur-xl md:flex"
      >
        {items.map(({ href, label, Icon, active, target }) => (
          <li key={href}>
            <Link
              href={target}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 rounded-lg py-3 transition-colors hover:bg-accent",
                active
                  ? "text-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="text-[11px] leading-none font-medium">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
