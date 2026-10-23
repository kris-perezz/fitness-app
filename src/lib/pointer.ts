import { useMediaQuery } from "@/lib/media-query";

/**
 * Does this device have a pointer that can HOVER (S79 rule 3)?
 *
 * The rule bans hover as the only route to a number because a phone has no
 * hover -- not because a tooltip is bad. On a mouse it is the cheapest way to
 * read an exact value off a chart, so the rule is applied by asking the
 * question rather than by assuming the answer.
 *
 * A mouse plugged in later flips it.
 */
export function useFinePointer(): boolean {
  return useMediaQuery("(pointer: fine)");
}
