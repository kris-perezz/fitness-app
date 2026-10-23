"use client";

/**
 * A list with no natural end shows a page and grows on request, so the rest is
 * one tap away and nothing scrolls inside the page (docs rule T2). The
 * registry's `Pagination` was considered: numbered pages replace the list
 * instead of extending it, which loses your place.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const PAGE_SIZE = 10;

export type Paged<T> = { visible: T[]; hidden: number; more: () => void };

/** Back to one page whenever `resetKey` changes, such as a new search. */
export function usePaged<T>(items: T[], resetKey?: unknown): Paged<T> {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(PAGE_SIZE);
  }
  return {
    visible: items.slice(0, limit),
    hidden: Math.max(0, items.length - limit),
    more: () => setLimit((n) => n + PAGE_SIZE),
  };
}

export function ShowMore({ paged }: { paged: Paged<unknown> }) {
  if (paged.hidden === 0) return null;
  return (
    <Button
      variant="ghost"
      className="h-11 w-full rounded-none border-t border-border text-muted-foreground"
      onClick={paged.more}
    >
      Show {Math.min(paged.hidden, PAGE_SIZE)} more
    </Button>
  );
}
