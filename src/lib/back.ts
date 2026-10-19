"use client";

import { useRouter } from "next/navigation";

let navigatedInApp = false;

/** Called by the layout on every client-side route change after the first. */
export function markNavigated() {
  navigatedInApp = true;
}

/**
 * Back as the phone means it: the screen you came from. Pushing the parent
 * instead stacked a new entry, so the system back button walked you round in
 * a loop. Opened cold from a link, there is nothing in-app to go back to, so
 * this replaces the entry with the parent.
 */
export function useBack(parent: string) {
  const router = useRouter();
  return () => (navigatedInApp ? router.back() : router.replace(parent));
}
