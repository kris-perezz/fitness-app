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
  { href: "/log", label: "Food", icon: UtensilsCrossed },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/goals", label: "Profile", icon: User },
] as const;

/** Routes that are not part of the signed-in app shell. */
const CHROMELESS = ["/login", "/auth"];

export function BottomNav() {
  const pathname = usePathname();

  // Sign-in is not a section, and a nav bar there would offer four dead links.
  if (CHROMELESS.some((route) => pathname.startsWith(route))) return null;

  return (
    <nav
      aria-label="Sections"
      // Floating rather than edge-glued, and inset from the bottom by the home
      // indicator's own height so it never sits under the gesture bar.
      className="fixed inset-x-0 bottom-0 z-40 pb-safe"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1 border-t border-border bg-background/85 px-2 py-1 backdrop-blur-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          // Prefix match so nested routes keep their tab lit.
          const active = pathname === href || pathname.startsWith(`${href}/`);

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
