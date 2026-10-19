import type { createClient } from "@/lib/supabase/server";
import type { Food } from "@/lib/food";
import { toMicros } from "@/lib/micros";

/** A row as it comes out of the catalog, before the supersede filter. */
export type CatalogRow = Food & { created_by: string | null; supersedes: string | null };

/**
 * Hide the rows this user has corrected (S7). A fork carries `supersedes`, and
 * the original is only hidden from whoever wrote the fork -- everybody else
 * still sees the row they have been using, because a correction is one person's
 * reading of one package, not a fact about the catalog.
 */
export function visibleFoods(rows: CatalogRow[], userId: string | null): Food[] {
  const corrected = new Set(
    rows
      .filter((r) => userId !== null && r.created_by === userId && r.supersedes)
      .map((r) => r.supersedes as string),
  );
  return rows
    .filter((r) => !corrected.has(r.id))
    // S36. `micros` is jsonb, so what comes back is whatever is stored -- not
    // necessarily the vocabulary this app recognises. Narrowed here, at the one
    // boundary where a database value becomes a `Food`, so nothing downstream
    // has to wonder whether a key is one of ours.
    .map((r) => ({ ...r, micros: toMicros(r.micros) }));
}

/**
 * The seed set and your own rows. Shared Health Canada and Open Food Facts rows
 * other people added are left to the online search, or this would grow with
 * every user's catalog and ship whole on every load.
 */
export function catalog(supabase: Awaited<ReturnType<typeof createClient>>, userId: string | null) {
  const query = supabase.from("foods").select("*").order("name");
  return (
    userId ? query.or(`created_by.is.null,created_by.eq.${userId}`) : query.is("created_by", null)
  ).overrideTypes<CatalogRow[], { merge: false }>();
}
