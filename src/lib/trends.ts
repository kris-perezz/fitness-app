/**
 * The Food tab's Trends view (S83-S86): what a month of eating looks like,
 * rather than what today looks like.
 *
 * Pure functions over `intake_days`, which has summed exactly these figures
 * since 0001. Nothing is stored and nothing is recomputed from entries -- the
 * view IS the aggregate, and a second copy of it here would be a second thing
 * to keep in step.
 */

/** One row of `intake_days`. The view's own shape, not a reshaping of it. */
export type IntakeDay = {
  log_date: string;
  kcal: number;
  protein_g: number;
  estimate_count: number;
  item_count: number;
};

/**
 * A day on the chart. Null is the load-bearing value here: a day you did not
 * log is a GAP, not a zero.
 *
 * A zero bar is a claim -- "you ate nothing" -- and the one thing a food log
 * can never assert is what happened while it was closed. `item_count` already
 * tells the two apart, so nothing has to be inferred (S83).
 */
export type TrendPoint = {
  date: string;
  kcal: number | null;
  protein_g: number | null;
};

/** Days back from today, inclusive of today. 30 is the window (charts open decision). */
export const TREND_DAYS = 30;

/**
 * The window, rolled back from today rather than snapped to the 1st.
 *
 * Same rule the weight chart had to be corrected to (S62): a month-to-date
 * window shows one day on the 1st and thirty-one on the 31st, so the same
 * screen means something different depending on when you open it.
 */
export function trendsWindow(today: string, days = TREND_DAYS): { from: string; to: string } {
  const end = new Date(`${today}T12:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { from: iso(start), to: today };
}

/**
 * One point per calendar day across the window, whether or not it was logged.
 *
 * Built from the calendar rather than from the rows, because the rows only
 * contain days that exist. Iterating the returned rows would silently close
 * every gap by omitting it, and the gaps are the shape this chart is about.
 */
export function dailySeries(days: IntakeDay[], from: string, to: string): TrendPoint[] {
  const byDate = new Map(days.map((d) => [d.log_date, d]));
  const out: TrendPoint[] = [];

  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    const date = iso(cursor);
    const day = byDate.get(date);
    // item_count === 0 cannot normally happen (the view groups entries, so a
    // row exists only where an entry does) but it is checked anyway: a day
    // whose entries were all deleted must read as unlogged, not as a zero.
    const logged = day !== undefined && day.item_count > 0;
    out.push({
      date,
      kcal: logged ? day.kcal : null,
      protein_g: logged ? day.protein_g : null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * How much of the window was guessed (S86).
 *
 * Stated flat and never graded. An estimate is a legitimate entry (S35), and
 * this number is context for how hard to lean on the rest of the screen rather
 * than a score to improve.
 */
export type EstimateShare = { entries: number; estimates: number; percent: number };

export function estimateShare(days: IntakeDay[]): EstimateShare {
  const entries = days.reduce((n, d) => n + d.item_count, 0);
  const estimates = days.reduce((n, d) => n + d.estimate_count, 0);
  // No entries is 0%, not NaN and not "0% of nothing is fine": the caller
  // renders nothing at all in that case, and this must not be what decides it.
  const percent = entries === 0 ? 0 : Math.round((estimates / entries) * 100);
  return { entries, estimates, percent };
}

/** Days actually logged in the window -- the denominator for everything else. */
export function loggedDays(days: IntakeDay[]): number {
  return days.filter((d) => d.item_count > 0).length;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
