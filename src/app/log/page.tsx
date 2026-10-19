import { authUser, createClient, must } from "@/lib/supabase/server";
import { catalog, visibleFoods } from "@/lib/catalog";
import {
  LOG_WINDOW_DAYS,
  shiftDate,
  type IntakeEntry,
} from "@/lib/food";
import { toDayGoal, withTodayGoal } from "@/lib/goals";
import { LogScreen } from "@/components/log-screen";
import { serverToday } from "@/lib/server-time";

export const dynamic = "force-dynamic";

/** A row as it comes out of the catalog, before the supersede filter below. */

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
  const today = await serverToday();
  const valid =
    requested !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    !Number.isNaN(Date.parse(requested)) &&
    requested <= today;
  const date = valid ? requested : today;

  // Both ways from the anchor, unlike train's one -- days can be paged forward
  // as well as back, and arriving on an old day through `?date=` would
  // otherwise put the edge one tap away. Never past today: there is nothing
  // there to fetch.
  const from = shiftDate(date, -LOG_WINDOW_DAYS);
  const ahead = shiftDate(date, LOG_WINDOW_DAYS);
  const to = ahead > today ? today : ahead;

  const supabase = await createClient();
  const user = await authUser(supabase);

  const [foods, entries, dayGoals, settings] =
    await Promise.all([
      catalog(supabase, user?.id ?? null).then(must),
      supabase
        .from("intake_entries")
        .select("*")
        .gte("log_date", from)
        .lte("log_date", to)
        .order("created_at", { ascending: true })
        .then(must),
      // S60. The dated goal for every day in the window, looked up in Postgres
      // rather than pulled whole and filtered client-side. A day with no row
      // here has no goal -- the log tab grades it against nothing rather than
      // guessing at an earlier or later one.
      supabase
        .from("day_goals")
        .select("log_date, calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g")
        .gte("log_date", from)
        .lte("log_date", to)
        .then(must),
      // The tone (S77) and the live prescription. Past days take their goal
      // from day_goals above, one per day; today has no row there until its
      // first entry seeds one, so it reads the prescription instead.
      supabase
        .from("nutrition_settings")
        // "*" so a database without 0035 still reads, with `onboarded` absent.
        .select("*")
        .maybeSingle()
        .then(must),
    ]);

  return (
    <LogScreen
      loadedFrom={from}
      loadedTo={to}
      foods={visibleFoods(foods ?? [], user?.id ?? null)}
      entries={(entries ?? []) as IntakeEntry[]}
      dayGoals={withTodayGoal(
        (dayGoals ?? []).map(toDayGoal),
        today,
        settings && settings.onboarded !== false ? toDayGoal({ ...settings, log_date: today }) : null,
      )}
      strictMode={settings?.strict_mode === true}
      needsTargets={settings?.onboarded === false}
    />
  );
}
