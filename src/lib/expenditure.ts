/**
 * Expenditure estimated from intake and weigh-ins, and the calorie target that
 * follows from it.
 *
 * A Kalman filter over two states, tissue weight and daily burn: each day
 * predicts the morning weight from yesterday's intake, and the scale's surprise
 * is split between "burn is off" and "the scale is noisy". The model-validation
 * study chose this over a trailing 14-day back-calculation, which lagged its own
 * intake window and read burn about 100 kcal low.
 */

import { daysBetween, shiftDays, type WeighIn } from "./weight.ts";

/**
 * kcal per lb of tissue change, the same both ways. MacroFactor's V3 mirrors gain
 * and loss after finding a lighter gain constant inflated surplus expenditure.
 */
export const KCAL_PER_LB = 3500;

/** Days of history before an estimate is shown. */
export const SHOW_AFTER_DAYS = 14;

/** Days of history before the estimate has outlived its seed. */
export const CONFIDENT_AFTER_DAYS = 28;

// Fixed filter settings from the study; per-user refits bought ~25 kcal early and
// nothing after week 16.
const SCALE_SD_LB = 0.9;
const BURN_DRIFT_SD = 10;
const TISSUE_DRIFT_SD_LB = 0.05;
const LOGGED_INTAKE_CV = 0.08;
const UNLOGGED_INTAKE_SD = 500;
/** Burn moves ~10 kcal/day per lb of tissue gained or lost. */
const BURN_PER_LB = 10;
const PRIOR_KCAL_PER_LB = 15;
const PRIOR_SD = 500;
const HUBER_C = 2.5;
const IMPUTE_DAYS = 14;
/** Below this a logged day is taken as partly logged and imputed instead. */
const PARTIAL_DAY_KCAL = 1000;

export type IntakeTotal = { log_date: string; kcal: number; item_count: number };

export type ExpenditurePoint = { date: string; kcal: number };

export type Expenditure = {
  points: ExpenditurePoint[];
  /**
   * The estimate as of the latest Sunday, so targets move once a week rather
   * than chasing daily noise. Null until `SHOW_AFTER_DAYS` of history.
   */
  kcal: number | null;
  /** Days since the first weigh-in. Below `CONFIDENT_AFTER_DAYS` it is still settling. */
  updates: number;
  confident: boolean;
  /** The filter's current tissue weight, the base for a %-of-body-weight rate. */
  weightLb: number | null;
};

export function energyOf(lbChange: number): number {
  return lbChange * KCAL_PER_LB;
}

export function estimateExpenditure(
  weighIns: WeighIn[],
  intake: IntakeTotal[],
  today: string,
): Expenditure {
  const empty: Expenditure = { points: [], kcal: null, updates: 0, confident: false, weightLb: null };
  const readings = weighIns.filter((w) => w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (readings.length === 0) return empty;

  const byDate = new Map<string, number[]>();
  for (const w of readings) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w.weightLb]);
  const kcalOn = new Map(
    intake
      .filter((d) => d.item_count > 0 && Number(d.kcal) >= PARTIAL_DAY_KCAL)
      .map((d) => [d.log_date, Number(d.kcal)]),
  );

  const first = readings[0].date;
  let m = readings[0].weightLb;
  let e = PRIOR_KCAL_PER_LB * m;
  let p00 = SCALE_SD_LB ** 2;
  let p01 = 0;
  let p11 = PRIOR_SD ** 2;
  const a11 = 1 - BURN_PER_LB / KCAL_PER_LB;
  let lastLogged: number | null = null;

  const points: ExpenditurePoint[] = [];
  let weekly: number | null = null;

  for (let day = first; day <= today; day = shiftDays(day, 1)) {
    if (day !== first) {
      const yesterday = shiftDays(day, -1);
      const logged = kcalOn.get(yesterday);
      const eaten = logged ?? imputeIntake(kcalOn, yesterday) ?? lastLogged ?? e;
      const intakeVar = logged !== undefined ? (LOGGED_INTAKE_CV * logged) ** 2 : UNLOGGED_INTAKE_SD ** 2;
      if (logged !== undefined) lastLogged = logged;

      const vM = TISSUE_DRIFT_SD_LB ** 2 + intakeVar / KCAL_PER_LB ** 2;
      const n00 = p00 - (2 * p01) / KCAL_PER_LB + p11 / KCAL_PER_LB ** 2 + vM;
      const n01 = a11 * (p01 - p11 / KCAL_PER_LB) + vM * BURN_PER_LB;
      const n11 = a11 ** 2 * p11 + vM * BURN_PER_LB ** 2 + BURN_DRIFT_SD ** 2;
      m = m + (eaten - e) / KCAL_PER_LB;
      e = a11 * e + (BURN_PER_LB * eaten) / KCAL_PER_LB;
      p00 = n00;
      p01 = n01;
      p11 = n11;

      for (const y of byDate.get(day) ?? []) {
        const v = y - m;
        const s0 = p00 + SCALE_SD_LB ** 2;
        const z = Math.abs(v) / Math.sqrt(s0);
        // Huber: a reading far off the prediction counts as a noisier one.
        const s = z > HUBER_C ? p00 + (SCALE_SD_LB ** 2 * z) / HUBER_C : s0;
        const k0 = p00 / s;
        const k1 = p01 / s;
        m += k0 * v;
        e += k1 * v;
        p11 -= k1 * p01;
        p01 -= k0 * p01;
        p00 -= k0 * p00;
      }
    }

    points.push({ date: day, kcal: Math.round(e) });
    const isSunday = new Date(`${day}T12:00:00`).getDay() === 0;
    if (isSunday && daysBetween(first, day) >= SHOW_AFTER_DAYS) weekly = Math.round(e);
  }

  const updates = daysBetween(first, today);
  return {
    points,
    kcal: weekly,
    updates,
    confident: updates >= CONFIDENT_AFTER_DAYS,
    weightLb: Math.round(m * 10) / 10,
  };
}

/** Mean logged intake over the calendar fortnight before `date`, or null if none. */
function imputeIntake(kcalOn: Map<string, number>, date: string): number | null {
  let total = 0;
  let n = 0;
  for (let i = 1; i <= IMPUTE_DAYS; i += 1) {
    const kcal = kcalOn.get(shiftDays(date, -i));
    if (kcal === undefined) continue;
    total += kcal;
    n += 1;
  }
  return n > 0 ? total / n : null;
}

/**
 * The daily calorie target for a goal rate, from the current estimate. Each
 * week stands alone: a missed week is not made up by a harsher next one.
 */
export function calorieTarget(expenditureKcal: number, goalRateLbPerWeek: number): number {
  return Math.round(expenditureKcal + energyOf(goalRateLbPerWeek) / 7);
}

/** A %-of-body-weight weekly rate in lb, for a body of `weightLb`. */
export function rateLb(ratePct: number, weightLb: number): number {
  return (ratePct / 100) * weightLb;
}
