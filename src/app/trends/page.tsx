import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { TREND_DAYS, dailySeries, trendsWindow, type IntakeDay, type TopFood } from "@/lib/trends";
import { toDayGoal, type DayGoal } from "@/lib/goals";
import { TrendsScreen } from "@/components/trends-screen";

export const dynamic = "force-dynamic";

/**
 * The Trends view (S83-S86).
 *
 * Reads `intake_days`, which has summed exactly these figures since 0001 -- no
 * new query shape and no new table. The window is a rolling 30 days ending
 * today, not month-to-date: a month-to-date screen is one day long on the 1st.
 *
 * The waking day, so a 2 a.m. entry counts toward the day you woke on and the
 * window ends where the log tab says today ends.
 */
export default async function TrendsPage() {
  const supabase = await createClient();
  const today = wakingDate();
  const { from, to } = trendsWindow(today, TREND_DAYS);

  const [{ data: days }, { data: settings }, { data: dayGoals }, top] = await Promise.all([
    supabase
      .from("intake_days")
      .select("log_date, kcal, protein_g, estimate_count, item_count")
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date"),
    // Only strict_mode is read live (S77). The goal numbers themselves come
    // from day_goals below, one stored row per day rather than one live row
    // for the whole window (S60).
    supabase.from("nutrition_settings").select("strict_mode").maybeSingle(),
    supabase
      .from("day_goals")
      .select("log_date, calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g")
      .gte("log_date", from)
      .lte("log_date", to),
    // S85. Grouped in Postgres by `top_foods` (0023). The error is CARRIED
    // rather than thrown: until that migration is run the function does not
    // exist, and one missing section is a better failure than a blank screen
    // where the two charts above it would have worked.
    supabase.rpc("top_foods", { from_date: from, to_date: to, row_limit: 10 }),
  ]);

  const rows = (days ?? []) as IntakeDay[];
  // S79. THE GOAL LINES ARE A STRICT-MODE IDEA, here as much as on the log
  // tab: a line across the chart turns thirty days of eating into thirty
  // days scored against a number. Calm passes no rows at all, which is the
  // same no-goal path a day with no stored row already takes -- neither
  // chart needs a second mode to draw nothing.
  const goals: DayGoal[] = settings?.strict_mode === true ? (dayGoals ?? []).map(toDayGoal) : [];

  return (
    <TrendsScreen
      points={dailySeries(rows, goals, from, to)}
      days={rows}
      topFoods={top.error ? null : ((top.data ?? []) as TopFood[])}
    />
  );
}
