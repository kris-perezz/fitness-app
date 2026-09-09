import { useSyncExternalStore } from "react";

const FINE_POINTER = "(pointer: fine)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Does this device have a pointer that can HOVER (S79 rule 3)?
 *
 * The rule bans hover as the only route to a number because a phone has no
 * hover -- not because a tooltip is bad. On a mouse it is the cheapest way to
 * read an exact value off a chart, so the rule is applied by asking the
 * question rather than by assuming the answer.
 *
 * `useSyncExternalStore` rather than an effect writing state: a media query IS
 * an external store, and this is the API that reads one without a render pass
 * spent correcting the first answer. The server snapshot is false, so markup
 * matches on the first paint and a tooltip that was never in the HTML cannot
 * mismatch. A mouse plugged in later flips it, which the listener covers.
 */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}
