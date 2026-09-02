import { trendSeries, type WeighIn } from "./weight.ts";
import type { IntakeDay } from "./trends.ts";

/**
 * What the calories actually did (S63).
 *
 * Average intake for a week beside what the trend weight did over that same
 * week. This is the only thing in the app that no single-purpose tracker can
 * do, and it is the whole argument for the food log and the scale living
 * together: it is the honest version of a "calculated TDEE" -- observed intake
 * and observed rate, with the arithmetic visible and nothing inferred.
 *
 * It REPORTS and never prescribes. Nothing here writes back to the calorie goal
 * (progress open decision 4), because doing that needs a confidence model, a
 * change cadence, and a user who trusts it -- none of which exist.
 */

/**
 * Weeks under this many logged days are excluded, and SAID to be excluded.
 *
 * An energy balance inferred from three logged days is wrong in a direction the
 * user cannot see: the unlogged days are disproportionately the big ones, so a
 * thin week reads as a deficit that never happened. S39 refused a number for
 * the same reason, and this is that instinct applied where it costs something.
 */
export const MIN_LOGGED_DAYS = 5;

export type EnergyWeek = {
  /** Monday of the week, as a date string. */
  weekStart: string;
  /** Average calories across the days that WERE logged, not across seven. */
  avgKcal: number | null;
  loggedDays: number;
  /** Trend weight at the end of the week minus at the start. Null if unknown. */
  changeLb: number | null;
  /** False when the week is too thinly logged to say anything. */
  included: boolean;
};

/**
 * One row per week, most recent first.
 *
 * Weeks start on MONDAY. Any choice here is arbitrary, but it has to be stable:
 * a week boundary that moves with today's weekday would reshuffle every row
 * each time the screen is opened.
 */
export function weeklyEnergy(
  days: IntakeDay[],
  entries: WeighIn[],
  weeks = 8,
  today = new Date(),
): EnergyWeek[] {
  const trend = new Map(trendSeries(entries).map((p) => [p.date, p.trendLb]));
  const dayByDate = new Map(days.map((d) => [d.log_date, d]));

  const out: EnergyWeek[] = [];
  let monday = mondayOf(today);

  for (let i = 0; i < weeks; i++) {
    const weekStart = iso(monday);
    const dates = Array.from({ length: 7 }, (_, n) => shift(weekStart, n));

    const logged = dates
      .map((d) => dayByDate.get(d))
      .filter((d): d is IntakeDay => d !== undefined && d.item_count > 0);

    const included = logged.length >= MIN_LOGGED_DAYS;
    const avgKcal = logged.length > 0 ? Math.round(sum(logged.map((d) => d.kcal)) / logged.length) : null;

    out.push({
      weekStart,
      // The average is over LOGGED days, not over seven. Dividing by seven
      // would turn every missed day into a fast, which is the same lie the
      // adherence gate exists to catch -- and would hide it inside a number
      // that still looked plausible.
      avgKcal: included ? avgKcal : null,
      loggedDays: logged.length,
      changeLb: included ? weekChange(trend, dates) : null,
      included,
    });

    monday = new Date(monday);
    monday.setDate(monday.getDate() - 7);
  }

  return out;
}

/**
 * How much the trend moved across a week.
 *
 * Uses the FIRST and LAST day of the week that have a trend value, rather than
 * requiring Monday and Sunday exactly. A trend exists only on days with a
 * reading, and demanding both endpoints would throw away most weeks for
 * somebody who weighs three times a week.
 *
 * Null with fewer than two, because one point is not a change.
 */
function weekChange(trend: Map<string, number>, dates: string[]): number | null {
  const values = dates.map((d) => trend.get(d)).filter((v): v is number => v !== undefined);
  if (values.length < 2) return null;
  return Math.round((values[values.length - 1] - values[0]) * 10) / 10;
}

const sum = (ns: number[]) => ns.reduce((t, n) => t + n, 0);

function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay() is 0 for Sunday, which is the END of the week here, not the start.
  const back = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ------------------------------------------------------ did I show up (S65)

/**
 * Effort, next to outcome.
 *
 * ADHERENCE EXPLAINS MOST DISAPPOINTING CHARTS. A flat trend on 60% food
 * logging is not a metabolism story, and putting those two facts on one screen
 * is the cheapest honest thing this tab can do -- it costs two queries and it
 * stops a month of thin logging being read as a plateau.
 *
 * Two numbers, not a chart. A bar chart of two figures is decoration.
 */
export type Adherence = {
  /** Days with food logged in the trailing window. */
  loggedDays: number;
  windowDays: number;
  /** Training sessions since Monday. */
  sessionsThisWeek: number;
};

export const ADHERENCE_DAYS = 14;

export function adherence(
  days: IntakeDay[],
  sessionDates: string[],
  today = new Date(),
  windowDays = ADHERENCE_DAYS,
): Adherence {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (windowDays - 1));
  const from = iso(start);
  const to = iso(end);

  const loggedDays = days.filter(
    (d) => d.item_count > 0 && d.log_date >= from && d.log_date <= to,
  ).length;

  // THIS WEEK, not a trailing seven days: "3 sessions this week" is a claim
  // about the week you are in, and a rolling window would answer a question
  // nobody asked while looking at a Monday.
  const monday = iso(mondayOf(end));
  // Deduplicated by date, because S52 allows one session a day but the query
  // that feeds this does not promise it.
  const sessions = new Set(sessionDates.filter((d) => d >= monday && d <= to));

  return { loggedDays, windowDays, sessionsThisWeek: sessions.size };
}
