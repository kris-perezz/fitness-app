import { createClient } from "@/lib/supabase/server";
import {
  LOG_WINDOW_DAYS,
  shiftDate,
  wakingDate,
  type Food,
  type IntakeEntry,
} from "@/lib/food";
import { toMicros } from "@/lib/micros";
import { LogScreen } from "@/components/log-screen";

export const dynamic = "force-dynamic";

/** A row as it comes out of the catalog, before the supersede filter below. */
type CatalogRow = Food & { created_by: string | null; supersedes: string | null };

/**
 * A WINDOW, FETCHED ONCE, EXTENDED BEFORE ITS EDGE -- the same contract the
 * train tab moved to, and here for the same reason. The day used to be a query
 * parameter, so every tap of an arrow was a server round trip before the ring
 * and the meals changed, and a round trip is a round trip however well it is
 * optimised.
 *
 * So the day became client state and a window of entries comes up front. Days
 * rather than months: an arrow moves one day, and log-screen.tsx fetches the
 * next stretch while you are still two weeks from its edge.
 *
 * `?date=` survives as a way IN -- the window is anchored on whatever day is
 * asked for -- but the arrows no longer write it, so the URL stops tracking the
 * day and the back button no longer steps through it. Both were the price of
 * the same change on the train tab.
 */
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: requested } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : wakingDate();

  // Both ways from the anchor, unlike train's one -- days can be paged forward
  // as well as back, and arriving on an old day through `?date=` would
  // otherwise put the edge one tap away. Never past today: there is nothing
  // there to fetch.
  const today = wakingDate();
  const from = shiftDate(date, -LOG_WINDOW_DAYS);
  const ahead = shiftDate(date, LOG_WINDOW_DAYS);
  const to = ahead > today ? today : ahead;

  const supabase = await createClient();

  const [{ data: foods }, { data: entries }, { data: goals }, { data: auth }] = await Promise.all([
    supabase.from("foods").select("*").order("name"),
    supabase
      .from("intake_entries")
      .select("*")
      .gte("log_date", from)
      .lte("log_date", to)
      .order("created_at", { ascending: true }),
    supabase.from("nutrition_settings").select("*").maybeSingle(),
    supabase.auth.getUser(),
  ]);

  return (
    <LogScreen
      date={date}
      loadedFrom={from}
      loadedTo={to}
      foods={visibleFoods((foods ?? []) as CatalogRow[], auth.user?.id ?? null)}
      entries={(entries ?? []) as IntakeEntry[]}
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
