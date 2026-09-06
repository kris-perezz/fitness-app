import { createClient } from "@/lib/supabase/server";
import { todayDate } from "@/lib/food";
import { WINDOW_MONTHS, shiftMonth } from "@/lib/training";
import { loadIntakeDaysWindow } from "@/app/actions";
import { MonthLog } from "@/components/month-log";

export const dynamic = "force-dynamic";

/**
 * S103. The Food tab's month view: a day is filled once anything is logged
 * against it, exactly the shape /train and /progress already mark their own
 * calendars by (S57).
 *
 * S89, strict mode only: the fill becomes four rings read against that day's
 * `day_goals` row, which is why `strict_mode` is read here first -- it is
 * what decides whether the goal query below runs at all.
 *
 * A WINDOW, FETCHED ONCE, EXTENDED BEFORE ITS EDGE -- the same contract
 * train/page.tsx uses and for the same reason: the month is client state, so
 * paging it is a filter rather than a per-month round trip.
 */
export default async function MonthLogPage() {
  const today = todayDate();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("nutrition_settings")
    .select("strict_mode")
    .maybeSingle();
  const strictMode = settings?.strict_mode === true;

  const from = `${shiftMonth(today.slice(0, 7), -(WINDOW_MONTHS - 1))}-01`;
  const { days, dayGoals } = await loadIntakeDaysWindow(from, today, strictMode);

  return (
    <MonthLog
      today={today}
      loadedFrom={from}
      days={days}
      dayGoals={dayGoals}
      strictMode={strictMode}
    />
  );
}
