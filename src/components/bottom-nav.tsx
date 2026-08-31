"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, TrendingUp, User, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top-level navigation.
 *
 * Four destinations, no action button: a tab bar navigates between sections,
 * and adding food belongs to the section that owns it. Sits at the bottom
 * because that is the reachable half of a phone screen held one-handed.
 */
const TABS = [
  // `also` keeps a tab lit on the section's other routes. Recipes are part of
  // Food, not a fifth destination: you go there to define a dish, and the dish
  // then shows up in the food list like anything else (S16).
  { href: "/log", label: "Food", icon: UtensilsCrossed, also: ["/recipes"] },
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

export function BottomNav() {
  const pathname = usePathname();

  // Sign-in is not a section, and a nav bar there would offer four dead links.
  if (CHROMELESS.some((route) => pathname.startsWith(route))) return null;

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40"
    >
      {/* pb-safe belongs on the PAINTED element, not on the nav around it. On
          the nav it left the home-indicator strip below the bar backed by
          nothing, so page content scrolled through it sharp and unobscured --
          which reads as broken rather than as translucent. The inset is still
          there; it is now inside the surface doing the covering. */}
      <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1 border-t border-border bg-background/85 px-2 py-1 pb-safe backdrop-blur-md">
        {TABS.map(({ href, label, icon: Icon, also }) => {
          // Prefix match so nested routes keep their tab lit.
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            also.some((r: string) => pathname === r || pathname.startsWith(`${r}/`));

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 44px minimum target, which is the floor on both platforms.
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors active:bg-accent",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[11px] leading-none font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
