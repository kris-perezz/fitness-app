/**
 * THE CHART CONTRACT (S79). One set of rules every chart in this app obeys, so
 * a reader learns to read them once.
 *
 * Written as a module rather than as a wrapper component on purpose. The two
 * charts that existed before it -- the weight trend and sets-per-muscle -- are a
 * line and a horizontal bar chart with almost nothing structural in common, and
 * a component general enough to render both would take more props than recharts
 * does. What they share is a set of DECISIONS, and decisions are what this file
 * holds: the axis rules, the tick styling, the series defaults, the minimum
 * below which a chart is a sentence instead.
 *
 * The rules, and the reason each exists:
 *
 * 1. AXIS ZERO IS A CLAIM, NOT A DEFAULT. A measure of a body or a lift gets a
 *    FITTED axis (`measureDomain`): a 0-200 lb axis flattens a real cut into a
 *    horizontal line. A count or a total gets a ZERO-BASED one (`countDomain`):
 *    for sets, or calories in a day, zero is a real value that means something,
 *    and hiding it exaggerates every difference above it.
 * 2. GAPS STAY GAPS. `connectNulls: false` everywhere -- see `SERIES`. A line
 *    drawn across a fortnight you did not log is a measurement you did not take.
 * 3. NO HOVER TOOLTIPS. There is no hover on a phone, and a touch tooltip
 *    needing a long-press is a feature nobody discovers. Either the exact
 *    numbers are already on the screen -- labelled on the bar, listed under the
 *    chart -- or the chart offers tap-to-inspect. Hover is never the only way to
 *    a number.
 * 4. THIN DATA IS A SENTENCE. Under a chart's own minimum, render an `Empty`
 *    saying what is missing rather than a two-point line dressed up as a trend.
 *    `enoughToPlot` is the check; the minimum belongs to the story.
 * 5. COLOUR COMES FROM CHART CSS VARIABLES, never hardcoded hex, so both themes
 *    work without a second palette to keep in step. A goal or reference line is
 *    a neutral dashed rule and never `destructive` -- the sodium ceiling (S73)
 *    is the one exception in the app.
 */

/** ~180px inside `max-w-md`. Denser than this is unreadable at arm's length. */
export const CHART_CLASS = "h-[180px] w-full";

/**
 * Set on the tick rather than by className: recharts renders SVG `<text>`,
 * which a Tailwind font-size class does not reach.
 */
export const AXIS_TICK = { fontSize: 11 } as const;

/** At most four x-ticks on a phone, and no tick furniture. */
export const X_AXIS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  minTickGap: 48,
  tick: AXIS_TICK,
} as const;

export const Y_AXIS = {
  tickLine: false,
  axisLine: false,
  tickCount: 4,
  width: 34,
  tick: AXIS_TICK,
} as const;

/**
 * Series defaults. `connectNulls` is rule 2; the rest keep a chart still and
 * quiet -- an animating line redraws under the thumb that is pointing at it,
 * and `activeDot` is a hover affordance this app has no use for (rule 3).
 */
export const SERIES = {
  connectNulls: false,
  isAnimationActive: false,
  dot: false,
  activeDot: false,
} as const;

/**
 * A FITTED axis for a measure of a body or a lift (rule 1).
 *
 * Nulls are dropped rather than treated as zero: a day you did not weigh is not
 * a day you weighed nothing, and one such coercion would drag the floor to zero
 * and flatten the whole series.
 */
export function measureDomain(values: (number | null)[], pad = 1): [number, number] {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  // A chart with no values at all should be showing an Empty, not an axis; [0,1]
  // is the inert answer for the frame or two before the caller notices.
  if (present.length === 0) return [0, 1];
  return [Math.floor(Math.min(...present) - pad), Math.ceil(Math.max(...present) + pad)];
}

/**
 * A ZERO-BASED axis for a count or a total (rule 1), with the top rounded UP to
 * a step so the ruler is stable.
 *
 * The rounding is what stops one extra set rescaling every bar on screen by a
 * hair. `min` keeps an almost-empty chart from drawing a full-width bar for a
 * single set -- without it the axis fits the one value it has, which is the
 * per-view normalisation this rule exists to prevent.
 */
export function countDomain(values: number[], step = 10, min = step): [number, number] {
  const peak = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  return [0, Math.max(min, Math.ceil(peak / step) * step)];
}

/**
 * Is there enough here to draw (rule 4)?
 *
 * Counts POINTS THAT EXIST, not array length: a series padded to one entry per
 * calendar day is mostly nulls, and its length says nothing about how much was
 * actually measured. Two readings a month apart is two points however many days
 * separate them.
 */
export function enoughToPlot(values: (number | null)[], min: number): boolean {
  return values.filter((v) => v !== null && Number.isFinite(v)).length >= min;
}

/** A date-only string as an axis tick: "3 Sep". */
export function dayTick(date: string): string {
  // Midday, so a timezone offset cannot shunt a date-only string a day either way.
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
