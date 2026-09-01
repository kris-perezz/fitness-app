import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { WINDOW_MONTHS, shiftMonth } from "@/lib/training";
import { toWeighIn } from "@/lib/weight";
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
  const today = wakingDate();
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
      .select("goal_weight_lb, goal_rate_lb_per_week")
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

  return (
    <ProgressHome
      today={today}
      loadedFrom={from.slice(0, 7)}
      earliest={first?.log_date ?? null}
      entries={(data ?? []).map(toWeighIn)}
      // Numeric arrives from PostgREST as a string. `?? null` and not `??
      // undefined`: no goal is a state the screen renders deliberately (S60).
      goal={{
        weightLb: settings?.goal_weight_lb != null ? Number(settings.goal_weight_lb) : null,
        rateLbPerWeek:
          settings?.goal_rate_lb_per_week != null ? Number(settings.goal_rate_lb_per_week) : null,
      }}
    />
  );
}
