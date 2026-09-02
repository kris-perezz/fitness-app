import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { TREND_DAYS, dailySeries, trendsWindow, type IntakeDay } from "@/lib/trends";
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

  const [{ data: days }, { data: goals }] = await Promise.all([
    supabase
      .from("intake_days")
      .select("log_date, kcal, protein_g, estimate_count, item_count")
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date"),
    supabase.from("nutrition_settings").select("calorie_goal, protein_goal_g").maybeSingle(),
  ]);

  const rows = (days ?? []) as IntakeDay[];

  return (
    <TrendsScreen
      points={dailySeries(rows, from, to)}
      days={rows}
      // Null rather than a default: no goal on file means the chart draws no
      // reference line, which is different from drawing one at 2000 nobody set.
      calorieGoal={(goals?.calorie_goal as number | undefined) ?? null}
      proteinGoal={(goals?.protein_goal_g as number | undefined) ?? null}
    />
  );
}
