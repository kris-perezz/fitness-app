import { createClient } from "@/lib/supabase/server";
import { wakingDate, type Food } from "@/lib/food";
import { toMicros } from "@/lib/micros";
import { LogScreen } from "@/components/log-screen";

export const dynamic = "force-dynamic";

/** A row as it comes out of the catalog, before the supersede filter below. */
type CatalogRow = Food & { created_by: string | null; supersedes: string | null };

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: requested } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : wakingDate();

  const supabase = await createClient();

  const [{ data: foods }, { data: entries }, { data: goals }, { data: auth }] = await Promise.all([
    supabase.from("foods").select("*").order("name"),
    supabase
      .from("intake_entries")
      .select("*")
      .eq("log_date", date)
      .order("created_at", { ascending: true }),
    supabase.from("nutrition_settings").select("*").maybeSingle(),
    supabase.auth.getUser(),
  ]);

  return (
    <LogScreen
      date={date}
      foods={visibleFoods((foods ?? []) as CatalogRow[], auth.user?.id ?? null)}
      entries={entries ?? []}
      goals={goals}
    />
  );
}

/**
 * Hide the rows this user has corrected (S7). A fork carries `supersedes`, and
 * the original is only hidden from whoever wrote the fork -- everybody else
 * still sees the row they have been using, because a correction is one person's
 * reading of one package, not a fact about the catalog.
 */
function visibleFoods(rows: CatalogRow[], userId: string | null): Food[] {
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
