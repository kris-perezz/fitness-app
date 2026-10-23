import { useCallback, useSyncExternalStore } from "react";

/**
 * Live answer to a CSS media query. The server snapshot is false, so the first
 * paint matches the HTML and the real answer lands without a correcting render.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
