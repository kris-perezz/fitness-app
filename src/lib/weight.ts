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

  // The EARLIEST point inside the window anchors it, and `days` is measured
  // from that point rather than assumed to be `weeks * 7`. A window whose first
  // reading landed a week late spans three weeks, and dividing its change by
  // four would understate the rate by a quarter -- so the span is measured, not
  // named. That is also what makes `windowLabel` honest: it reports the days
  // actually covered, so "over the last 4 weeks" is never a rounding of three.
  //
  // Fewer than two points inside the window falls back to the last two readings
  // anywhere, which the 7-day floor below then usually rejects. Reporting
  // nothing beats reporting a rate off two readings a day apart.
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
  return `${sign}${Math.abs(rate.lbPerWeek).toFixed(1)} lb/week`;
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

// ------------------------------------------------------------------ S62
/**
 * The chart's window (S62).
 *
 * A table rather than five branches: the label, the span and the "how far back
 * must the data reach" question are one fact each, and a bucket added later is
 * a row here rather than an edit in three places.
 *
 * `months: null` is All, which is deliberately NOT a very large number of
 * months. All means "as far as the log goes", and the log's start is a fact
 * only the server knows -- so the caller supplies it and the two cases stay
 * visibly different.
 *
 * The window belongs to the CHART and not to the tab: the calendar and the list
 * stay on their own month (S57). That is the story's own warning -- two time
 * selections on one screen -- and it is why this state lives beside the chart
 * rather than replacing `month`.
 */
export type ChartWindowKey = "1M" | "3M" | "6M" | "1Y" | "ALL";

export const CHART_WINDOWS: readonly {
  key: ChartWindowKey;
  label: string;
  title: string;
  months: number | null;
}[] = [
  { key: "1M", label: "1M", title: "Last month", months: 1 },
  { key: "3M", label: "3M", title: "Last 3 months", months: 3 },
  { key: "6M", label: "6M", title: "Last 6 months", months: 6 },
  { key: "1Y", label: "1Y", title: "Last year", months: 12 },
  { key: "ALL", label: "All", title: "All time", months: null },
];

/**
 * 3M by default: long enough for a trend to have a shape, short enough that
 * this month is not a pixel (S62).
 */
export const DEFAULT_CHART_WINDOW: ChartWindowKey = "3M";

export function chartWindow(key: ChartWindowKey) {
  return CHART_WINDOWS.find((w) => w.key === key) ?? CHART_WINDOWS[1];
}

/**
 * The first DAY a window covers, given today and the first day in the log.
 *
 * Month arithmetic done here rather than by importing `shiftMonth` from
 * `lib/training`: this module has no imports, which is what lets
 * `weight.test.mts` run under node's type stripping without a path-alias
 * resolver. That property is worth more than the six duplicated lines.
 *
 * A window never starts before the log does. Asking for a year of a
 * three-month log must draw three months, not nine months of white space that
 * reads as weight you failed to record.
 */
export function chartWindowFrom(
  key: ChartWindowKey,
  today: string,
  earliest: string | null,
): string {
  const spec = chartWindow(key);
  if (spec.months === null) return earliest ?? today;

  const d = new Date(`${today}T12:00:00`);
  // months - 1, and then the 1st: a 3M window is this month plus the two
  // before it, so the axis starts on a month boundary rather than mid-month.
  d.setDate(1);
  d.setMonth(d.getMonth() - (spec.months - 1));
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return earliest && earliest > start ? earliest : start;
}
