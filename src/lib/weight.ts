/**
 * The weight log and the trend under it (S54-S59).
 *
 * Everything here is a pure function over the rows. Nothing is stored: the
 * trend is a reading of the weigh-ins, not a second fact beside them, so there
 * is no cache to invalidate and no way for the two to disagree. Progress open
 * decision 2, settled that way for exactly this reason.
 */

/** One scale reading. `note` is optional and never appears in a list row. */
export type WeighIn = {
  date: string;
  weightLb: number;
  note: string | null;
};

/**
 * PostgREST hands `numeric` back as a string, so the conversion happens once at
 * the boundary rather than at every use -- the same rule the train tab follows
 * for set counts and volume.
 *
 * Here rather than in `progress-actions.ts` because that module is `"use
 * server"`, where every export is a network endpoint and a synchronous one will
 * not build.
 */
export function toWeighIn(row: {
  log_date: unknown;
  weight_lb: unknown;
  note: unknown;
}): WeighIn {
  return {
    date: row.log_date as string,
    weightLb: Number(row.weight_lb),
    note: (row.note as string | null) ?? null,
  };
}

/**
 * Progress open decision 1, settled: an exponentially-weighted moving average
 * with a ten-day half life, not a seven-day simple average.
 *
 * A simple average is easier to explain, and that was the argument for it. What
 * decided it the other way is the lag: a 7-day mean sits half a week behind, so
 * the first week of a diet change is invisible in the number you are checking
 * it with. Ten days is the half life MacroFactor and Happy Scale settle around
 * -- responsive enough to show a real change inside a fortnight, slow enough
 * that one salty dinner does not move the headline.
 *
 * Cheap to change: one constant, and nothing is stored in this shape.
 */
export const HALF_LIFE_DAYS = 10;

/** Under this many readings there is nothing to smooth (S58). */
export const MIN_TREND_ENTRIES = 5;

/** The default window S59 states its rate over. */
export const RATE_WEEKS = 4;

export type TrendPoint = {
  date: string;
  /** The reading that day, as it came off the scale. */
  weightLb: number;
  /** The smoothed value at that date. */
  trendLb: number;
};

/**
 * The trend series, one point per WEIGH-IN, smoothed over CALENDAR days.
 *
 * The distinction is the whole story of S58. Smoothing over entries treats "ten
 * readings" as a fixed span, so someone who weighs daily gets ten days of
 * smoothing and someone who weighs twice a week gets five weeks of it from the
 * identical code -- and a fortnight you did not weigh silently compresses into
 * the same lag as a fortnight you did.
 *
 * So the weight given to a new reading is a function of the GAP before it:
 *
 *     w = 1 - 0.5 ^ (gap / halfLife)
 *
 * A reading the next day barely moves the trend. A reading after three weeks
 * away moves it most of the way, because three weeks of unobserved drift is
 * genuinely most of what we now know. The half life keeps its plain meaning at
 * every spacing: after `HALF_LIFE_DAYS`, half the distance to the new reading
 * has been closed.
 *
 * No missing days are invented. An earlier draft filled the gaps with carried-
 * forward readings so a fixed-alpha EMA could walk day by day, which produces
 * the same curve and also produces a series full of measurements that were
 * never taken -- rows a chart would happily plot.
 *
 * Entries may arrive in any order (S55 makes back-dating a first-class path),
 * so this sorts rather than trusting its input.
 */
export function trendSeries(entries: WeighIn[], halfLife = HALF_LIFE_DAYS): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];

  let trend = 0;
  let previous = "";

  for (const entry of sorted) {
    if (out.length === 0) {
      // The first reading is the only estimate available, so the trend starts
      // on it. Seeding at zero instead would spend the first fortnight climbing
      // out of a number that was never a bodyweight.
      trend = entry.weightLb;
    } else {
      const gap = Math.max(1, daysBetween(previous, entry.date));
      const weight = 1 - Math.pow(0.5, gap / halfLife);
      trend += weight * (entry.weightLb - trend);
    }
    previous = entry.date;
    out.push({ date: entry.date, weightLb: entry.weightLb, trendLb: trend });
  }

  return out;
}

/**
 * The same trend, reshaped for a chart: one point per CALENDAR DAY across the
 * span, with nulls on the days nothing was recorded.
 *
 * This looks like the opposite of what `trendSeries` refuses to do, and it is
 * the opposite in a way that matters. That function will not invent a READING
 * on a day you did not weigh. This one inserts an explicit ABSENCE, which is a
 * different claim: paired with `connectNulls={false}` it is what stops recharts
 * drawing a straight line across a fortnight you never stood on a scale and
 * presenting it as a measurement (S61, S79).
 *
 * Both series break together. The trend has no more claim to continuity than
 * the readings do -- it is derived from them -- so it "simply resumes" on the
 * far side of the hole rather than gliding across it.
 */
export type ChartPoint = {
  date: string;
  weightLb: number | null;
  trendLb: number | null;
};

export function chartSeries(entries: WeighIn[], fromDate?: string): ChartPoint[] {
  const series = trendSeries(entries).filter((p) => (fromDate ? p.date >= fromDate : true));
  if (series.length === 0) return [];

  const byDate = new Map(series.map((p) => [p.date, p]));
  const out: ChartPoint[] = [];

  for (
    let day = series[0].date;
    day <= series[series.length - 1].date;
    day = shiftDays(day, 1)
  ) {
    const point = byDate.get(day);
    out.push({
      date: day,
      weightLb: point?.weightLb ?? null,
      trendLb: point?.trendLb ?? null,
    });
  }

  return out;
}

/**
 * The y-axis bounds for the chart, fitted to the data with a pound of air above
 * and below.
 *
 * NOT zero-based, and S79 is emphatic about why: a 0-200 lb axis flattens a
 * genuine cut into a horizontal line. Zero-based is right for counts, where zero
 * is a real value with a meaning; a bodyweight axis that reaches zero is
 * measuring against a number no reader has ever been.
 */
export function axisDomain(points: ChartPoint[], pad = 1): [number, number] {
  const values = points.flatMap((p) =>
    [p.weightLb, p.trendLb].filter((v): v is number => v !== null),
  );
  if (values.length === 0) return [0, 1];
  return [Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)];
}

/**
 * What the tab leads with: the smoothed number, the reading it came from, and
 * whether there is enough history to call it a trend at all.
 *
 * `trendLb` is null below the floor rather than a smoothed value nobody should
 * read. The caller shows the raw weight and says what is missing (S58) -- a
 * two-point average presented as a trend is the app inventing confidence.
 */
export type Headline = {
  latest: WeighIn;
  trendLb: number | null;
  entryCount: number;
};

export function headline(entries: WeighIn[]): Headline | null {
  const series = trendSeries(entries);
  if (series.length === 0) return null;

  const last = series[series.length - 1];
  return {
    latest: {
      date: last.date,
      weightLb: last.weightLb,
      note: entries.find((e) => e.date === last.date)?.note ?? null,
    },
    trendLb: series.length >= MIN_TREND_ENTRIES ? last.trendLb : null,
    entryCount: series.length,
  };
}

export type Rate = {
  /** Signed pounds per week. Negative is losing. */
  lbPerWeek: number;
  /** Days actually spanned, which is what makes the rate a fact (S59). */
  days: number;
};

/**
 * Weekly rate of change, measured on the TREND and not on the readings (S59).
 *
 * First-and-last raw weights is the same noise problem wearing a hat: it makes
 * the answer depend on whether the two days that happen to bracket the window
 * were salty ones. Both ends here are smoothed values.
 *
 * Returns null rather than a number when the window holds too little to divide
 * by -- fewer than two points, or a span so short that a fraction of a pound
 * annualises into a claim nobody should act on.
 */
export function weeklyRate(
  entries: WeighIn[],
  weeks = RATE_WEEKS,
  today?: string,
): Rate | null {
  const series = trendSeries(entries);
  if (series.length < MIN_TREND_ENTRIES) return null;

  const end = series[series.length - 1];
  const cutoff = shiftDays(today ?? end.date, -weeks * 7);

  // The last point at or before the cutoff anchors the window. Without it, a
  // window whose first reading landed a week late would report a 3-week change
  // as though it took 4, and quietly understate every rate.
  const inWindow = series.filter((p) => p.date >= cutoff);
  const anchor = inWindow.length >= 2 ? inWindow[0] : series[series.length - 2];
  if (!anchor || anchor.date === end.date) return null;

  const days = daysBetween(anchor.date, end.date);
  if (days < 7) return null;

  return { lbPerWeek: ((end.trendLb - anchor.trendLb) / days) * 7, days };
}

/**
 * `-0.8 lb / week`, signed, with the sign carrying the meaning and nothing
 * else doing so. No "great job", no "behind schedule" -- S59 is explicit that a
 * tracker which editorialises about a body gets uninstalled, and the goal rate
 * beside it (S60) is what lets the reader draw their own conclusion.
 *
 * A true zero prints as `0.0`, not as "holding" or "maintaining": those are
 * interpretations, and a rate that rounds to nothing is still a rate.
 */
export function rateLabel(rate: Rate): string {
  const sign = rate.lbPerWeek > 0 ? "+" : rate.lbPerWeek < 0 ? "−" : "";
  return `${sign}${Math.abs(rate.lbPerWeek).toFixed(1)} lb / week`;
}

/** "over the last 4 weeks" -- a rate without its window is not a fact (S59). */
export function windowLabel(days: number): string {
  const weeks = Math.round(days / 7);
  if (weeks <= 1) return `over ${days} days`;
  return `over the last ${weeks} weeks`;
}

/**
 * The change since the previous entry, for a list row (S57). Signed and to one
 * decimal, because that is the precision a bathroom scale actually has.
 *
 * The delta is measured against the reading BEFORE it in time, not against the
 * row above it on screen -- they are the same thing today, and would stop being
 * the same thing the moment the list is ever sorted any other way.
 */
export function deltaLabel(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return "0.0";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}`;
}

/**
 * Whole days between two YYYY-MM-DD strings.
 *
 * Parsed at midday so neither a timezone offset nor a daylight-saving boundary
 * can round a span to the wrong integer -- the same trick the calendar helpers
 * use, for the same reason.
 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Shift a YYYY-MM-DD string by whole days. */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
