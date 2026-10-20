"use client";

import { useEffect, useEffectEvent, useId } from "react";

const live = new Set<string>();

/**
 * Makes the system back button close an open sheet instead of leaving the page.
 * Opening pushes a marker entry; back pops it and closes; closing any other way
 * pops it so no extra entry is left behind.
 */
export function useSheetBack(open: boolean, close: () => void) {
  const id = useId();
  const onBack = useEffectEvent(close);

  useEffect(() => {
    if (!open) return;
    live.add(id);
    // Next keeps its router data in history.state, so the marker extends it.
    if (history.state?.sheet !== id) history.pushState({ ...history.state, sheet: id }, "");
    // A sheet stacked on this one pops its own marker; ours is still on top then.
    const pop = () => history.state?.sheet !== id && onBack();
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      live.delete(id);
      // Deferred so Strict Mode's remount can claim the marker first.
      setTimeout(() => {
        if (!live.has(id) && history.state?.sheet === id) history.back();
      }, 0);
    };
  }, [open, id]);
}

/**
 * Navigates away from inside an open sheet. Closing first would pop the sheet's
 * marker while the push is in flight, and Next discards a navigation that a
 * popstate overtakes; replacing the marker instead keeps Back on the page below.
 */
export function leaveSheet(router: { push(href: string): void; replace(href: string): void }, href: string) {
  if (typeof history.state?.sheet === "string") router.replace(href);
  else router.push(href);
}
