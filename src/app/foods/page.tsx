import { createClient } from "@/lib/supabase/server";
import type { Food } from "@/lib/food";
import { toMicros } from "@/lib/micros";
import { FoodShelf } from "@/components/food-shelf";

export const dynamic = "force-dynamic";

type CatalogRow = Food & { created_by: string | null; supersedes: string | null };

/**
 * Your own rows only, unlike the log's catalog. The shared half of `foods` is
 * everybody's and is not a shelf anybody stocked; what you scanned, captured
 * or corrected is.
 *
 * Newest first, because the reason to come here is the thing you just scanned.
 */
export default async function FoodsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <FoodShelf foods={[]} />;

  const { data } = await supabase
    .from("foods")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return <FoodShelf foods={mine((data ?? []) as CatalogRow[])} />;
}

/** A correction supersedes the row it forked, and both are yours -- show the
 * one that replaced the other (S7). */
function mine(rows: CatalogRow[]): Food[] {
  const corrected = new Set(rows.filter((r) => r.supersedes).map((r) => r.supersedes as string));
  return rows
    .filter((r) => !corrected.has(r.id))
    .map((r) => ({ ...r, micros: toMicros(r.micros) }));
}
