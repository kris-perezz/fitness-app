import { createClient } from "@/lib/supabase/server";
import { todayDate } from "@/lib/food";
import { WINDOW_MONTHS, shiftMonth } from "@/lib/training";
import { toWeighIn } from "@/lib/weight";
import { liftHistory, type WorkoutSet } from "@/lib/training";
import { ProgressHome } from "@/components/progress-home";

export const dynamic = "force-dynamic";

export const metadata = { title: "Progress" };

/**
 * S57. The progress tab's resting state: a month of weigh-ins, with the trend
 * over them as the headline.
 *
 * A WINDOW, FETCHED ONCE, EXTENDED BEFORE ITS EDGE -- the same contract as the
 * train tab, and copied from it deliberately. S57 as written asks for `?month=`
 * on the server "the same navigation contract as /train?month=", but that
 * contract no longer exists: the train tab moved the month into client state
 * precisely because a round trip per calendar arrow is never seamless. Following
 * the story's letter would build the second month pager its own last bullet
 * warns against, so the intent wins and the story wants updating.
 *
 * One difference from train, forced by the maths rather than chosen: the trend
 * needs history from BEFORE the month on screen. A ten-day half life seeded on
 * the first of the month would read as a fresh start every month. So the
 * headline is computed over the whole loaded window and only the list and the
 * calendar are filtered to the month.
 */
export default async function ProgressPage() {
  const today = todayDate();
  const supabase = await createClient();

  const from = `${shiftMonth(today.slice(0, 7), -(WINDOW_MONTHS - 1))}-01`;

  // Together rather than in sequence: the goal row is tiny and independent of
  // the weigh-ins, so chaining them would spend a round trip to learn nothing.
  const [{ data }, { data: settings }, { data: first }] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("log_date, weight_lb, note")
      .gte("log_date", from)
      .order("log_date", { ascending: false }),
    supabase
      .from("nutrition_settings")
      .select(
        "goal_weight_lb, goal_rate_lb_per_week, display_weight_unit, strict_mode",
      )
      .maybeSingle(),
    // The first day in the log, which is what bounds S62's All. One row, and
    // the (user_id, log_date) index answers it without a scan. Fetched here
    // rather than inferred from `data`, which only ever holds the window.
    supabase
      .from("weigh_ins")
      .select("log_date")
      .order("log_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const weighIns = (data ?? []).map(toWeighIn);

  /**
   * S81/0033. The pinned lifts, oldest pin first so adding one never shuffles
   * the block somebody has been watching.
   *
   * Fetched in one round trip rather than one per pin: the slots for every
   * pinned exercise come back together and are split by id here, so a third
   * pin costs rows and not latency. No pins is a normal state and skips both
   * queries.
   */
  const pinned = await loadPinnedLifts(supabase);

  return (
    <ProgressHome
      today={today}
      loadedFrom={from.slice(0, 7)}
      earliest={first?.log_date ?? null}
      entries={weighIns}
      // S69. Defaults to lb when the column is missing, which is what the app
      // stores anyway -- so a preview running ahead of 0024 reads correctly.
      unit={settings?.display_weight_unit === "kg" ? "kg" : "lb"}
      pinned={pinned}
      // Numeric arrives from PostgREST as a string. `?? null` and not `??
      // undefined`: no goal is a state the screen renders deliberately (S60).
      //
      // S79. Calm sends both halves as null, because calm has no way to SET
      // them any more -- the fields left the goals tab with the rest of the
      // targets. A goal you can read but not edit is worse than no goal, and
      // S60 already built the blank state this falls back into: the rate is
      // stated and nothing sits beside it.
      goal={
        settings?.strict_mode === true
          ? {
              weightLb: settings?.goal_weight_lb != null ? Number(settings.goal_weight_lb) : null,
              rateLbPerWeek:
                settings?.goal_rate_lb_per_week != null
                  ? Number(settings.goal_rate_lb_per_week)
                  : null,
            }
          : { weightLb: null, rateLbPerWeek: null }
      }
    />
  );
}

/**
 * Every pinned exercise and its history, in the order the pins were made.
 *
 * Three queries whatever the number of pins: the pin ids, the names, and every
 * slot for all of them at once. Grouping the slots here rather than asking the
 * database once per exercise is the same call `top_foods` makes in the other
 * direction -- the work is trivial and the round trips are not.
 *
 * An exercise deleted since it was pinned drops out silently. The pin row goes
 * with it by cascade (0033), so this only ever covers the gap between the two.
 */
async function loadPinnedLifts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: pins } = await supabase
    .from("pinned_exercises")
    .select("exercise_id")
    .order("created_at", { ascending: true });

  const ids = (pins ?? []).map((p) => p.exercise_id as string);
  if (ids.length === 0) return [];

  const [{ data: exercises }, { data: slots }] = await Promise.all([
    supabase.from("exercises").select("id, name").in("id", ids),
    supabase
      .from("workout_exercises")
      .select("exercise_id, workout:workouts!inner(log_date), sets:workout_sets(*)")
      .in("exercise_id", ids),
  ]);

  const rows = (slots ?? []) as unknown as {
    exercise_id: string;
    workout: { log_date: string };
    sets: WorkoutSet[];
  }[];

  const byExercise = new Map<string, { log_date: string; sets: WorkoutSet[] }[]>();
  for (const row of rows) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push({ log_date: row.workout.log_date, sets: row.sets ?? [] });
    byExercise.set(row.exercise_id, list);
  }

  const named = new Map((exercises ?? []).map((e) => [e.id as string, e.name as string]));

  // Driven by `ids` rather than by `exercises`, because the pin order is the
  // display order and a `select ... in (...)` makes no promise about either.
  return ids.flatMap((id) => {
    const name = named.get(id);
    if (!name) return [];
    const { points } = liftHistory(byExercise.get(id) ?? []);
    return [{ id, name, points }];
  });
}
