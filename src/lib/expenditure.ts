/**
 * Expenditure back-calculated from intake and the weight trend, and the calorie
 * target that follows from it.
 *
 * The shape is MacroFactor's published one: calories in minus the change in
 * stored energy is calories out, read off the TREND rather than the scale, and
 * the estimate only moves on sustained prediction error. Their constants are
 * not public; the ones here are fitted to the worked examples they do publish.
 */

import { chartSeries, daysBetween, shiftDays, type WeighIn } from "./weight.ts";

/**
 * kcal per lb of trend change, the same both ways. MacroFactor's V3 mirrors gain
 * and loss after finding a lighter gain constant inflated surplus expenditure.
 */
export const KCAL_PER_LB = 3500;

/** Days of intake and trend change each daily observation spans. */
export const WINDOW_DAYS = 14;

/** Logged days a window needs, the same 4-in-7 floor MacroFactor's check-in asks for. */
export const MIN_LOGGED_DAYS = 8;

/**
 * How far one day's observation pulls the estimate. Small on purpose: a real
 * 500 kcal change should take three to four weeks to be believed, not three days.
 */
export const ALPHA = 0.1;

/** Days of updates before the estimate has outlived its seed. */
export const CONFIDENT_AFTER_DAYS = 28;

export type IntakeTotal = { log_date: string; kcal: number; item_count: number };

export type ExpenditurePoint = { date: string; kcal: number };

export type Expenditure = {
  points: ExpenditurePoint[];
  /** The latest estimate, or null until one window has enough data. */
  kcal: number | null;
  /** Days that moved the estimate. Below `CONFIDENT_AFTER_DAYS` it is still settling. */
  updates: number;
  confident: boolean;
};

export function energyOf(lbChange: number): number {
  return lbChange * KCAL_PER_LB;
}

/**
 * One estimate per day the data supports. A day without a full window carries
 * the last value forward rather than guessing, so a week off the log is a flat
 * stretch, not a collapse.
 */
export function estimateExpenditure(
  weighIns: WeighIn[],
  intake: IntakeTotal[],
  today: string,
): Expenditure {
  const trend = chartSeries(weighIns);
  const empty: Expenditure = { points: [], kcal: null, updates: 0, confident: false };
  if (trend.length === 0) return empty;

  const first = trend[0].date;
  const trendAt = (date: string) => trend[daysBetween(first, date)]?.trendLb ?? null;
  const kcalOn = new Map(
    intake.filter((d) => d.item_count > 0).map((d) => [d.log_date, Number(d.kcal)]),
  );

  const points: ExpenditurePoint[] = [];
  let estimate: number | null = null;
  let updates = 0;

  for (let day = shiftDays(first, WINDOW_DAYS); day <= today; day = shiftDays(day, 1)) {
    const end = trendAt(day);
    const start = trendAt(shiftDays(day, -WINDOW_DAYS));

    let total = 0;
    let logged = 0;
    for (let i = 0; i < WINDOW_DAYS; i += 1) {
      const kcal = kcalOn.get(shiftDays(day, -i));
      if (kcal === undefined) continue;
      total += kcal;
      logged += 1;
    }

    if (end !== null && start !== null && logged >= MIN_LOGGED_DAYS) {
      const observed = total / logged - energyOf(end - start) / WINDOW_DAYS;
      estimate = estimate === null ? observed : estimate + ALPHA * (observed - estimate);
      updates += 1;
    }
    if (estimate !== null) points.push({ date: day, kcal: Math.round(estimate) });
  }

  return {
    points,
    kcal: estimate === null ? null : Math.round(estimate),
    updates,
    confident: updates >= CONFIDENT_AFTER_DAYS,
  };
}

/**
 * The daily calorie target for a goal rate, from the current estimate. Each
 * week stands alone: a missed week is not made up by a harsher next one.
 */
export function calorieTarget(expenditureKcal: number, goalRateLbPerWeek: number): number {
  return Math.round(expenditureKcal + energyOf(goalRateLbPerWeek) / 7);
}
