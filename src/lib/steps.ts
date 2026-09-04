/**
 * Health Auto Export's payload, read two ways.
 *
 * The app posts a shape of its own choosing -- `data.metrics[]`, each metric a
 * name, a unit and an array of points -- and it aggregates by hour at coarsest,
 * so a run carries buckets rather than days. Summing them is this module's
 * whole job, and it is here rather than in the route so it can be tested
 * against real payload shapes without a request.
 *
 * THE DAY IS THE ONE THE PHONE MEANT. Each timestamp is local time with its own
 * offset appended -- "2026-09-03 23:30:00 -0600" -- so the date is already
 * written in the first ten characters. Parsing it into a Date and asking the
 * server for the day would move a late-evening bucket into tomorrow whenever
 * the server sits east of the phone.
 */

export type StepTotal = { date: string; steps: number };

/** One reading, at whatever grain the phone was asked to group by. */
export type HealthSample = {
  metric: string;
  /** ISO 8601, offset preserved, so the instant survives the round trip. */
  measured_at: string;
  /** The phone's own day. See the note above on why it is carried separately. */
  log_date: string;
  units: string | null;
  /** The point minus its date: `{ qty }` for most, richer for a few. */
  value: Record<string, unknown>;
};

/** What the app calls the metric. Matched loosely; the rest are ignored. */
const STEP_METRIC = "step_count";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dailyStepTotals(payload: unknown): StepTotal[] {
  const metrics = metricsOf(payload);
  const totals = new Map<string, number>();

  for (const metric of metrics) {
    if (nameOf(metric) !== STEP_METRIC) continue;

    for (const point of pointsOf(metric)) {
      const day = dayOf(point);
      if (day === null) continue;
      const qty = qtyOf(point);
      if (qty === null) continue;
      totals.set(day, (totals.get(day) ?? 0) + qty);
    }
  }

  return [...totals.entries()]
    .map(([date, steps]) => ({ date, steps: Math.round(steps) }))
    // Sorted so a run that writes several days writes them in the order they
    // happened, which is the order they read back in if one of them fails.
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricsOf(payload: unknown): unknown[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];
  const metrics = (data as { metrics?: unknown }).metrics;
  return Array.isArray(metrics) ? metrics : [];
}

function nameOf(metric: unknown): string | null {
  if (typeof metric !== "object" || metric === null) return null;
  const name = (metric as { name?: unknown }).name;
  return typeof name === "string" ? name.trim().toLowerCase() : null;
}

function pointsOf(metric: unknown): unknown[] {
  const data = (metric as { data?: unknown }).data;
  return Array.isArray(data) ? data : [];
}

function dayOf(point: unknown): string | null {
  if (typeof point !== "object" || point === null) return null;
  const date = (point as { date?: unknown }).date;
  if (typeof date !== "string") return null;
  const day = date.slice(0, 10);
  return DAY.test(day) ? day : null;
}

/**
 * Negative and non-finite quantities are dropped rather than clamped to zero: a
 * bucket that arrives broken should not lower the day's total, and a day that
 * loses one bucket is closer to the truth than one that gains a false zero.
 */
function qtyOf(point: unknown): number | null {
  const qty = (point as { qty?: unknown }).qty;
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0) return null;
  return qty;
}

/**
 * Every reading in the payload, flattened and left at its own grain.
 *
 * Deliberately does not aggregate. Steps sum over a day, a resting heart rate
 * averages, and no single rule is right for both -- so the rule is chosen by
 * whoever asks the question, not here.
 */
export function healthSamples(payload: unknown): HealthSample[] {
  const out: HealthSample[] = [];

  for (const metric of metricsOf(payload)) {
    const name = nameOf(metric);
    if (name === null) continue;
    const units = unitsOf(metric);

    for (const point of pointsOf(metric)) {
      const day = dayOf(point);
      const at = instantOf(point);
      if (day === null || at === null) continue;

      // The date is lifted into its own columns, so keeping it in the blob
      // would be the same fact stored twice and free to disagree with itself.
      const value = { ...(point as Record<string, unknown>) };
      delete value.date;

      out.push({ metric: name, measured_at: at, log_date: day, units, value });
    }
  }

  return out;
}

function unitsOf(metric: unknown): string | null {
  const units = (metric as { units?: unknown }).units;
  return typeof units === "string" && units !== "" ? units : null;
}

/**
 * "2026-09-03 14:30:00 -0600" is not a format `Date` parses reliably across
 * engines, and guessing wrong moves a reading by hours. Rewritten into ISO 8601
 * by hand -- the offset is already in the string, so nothing has to be inferred.
 */
const STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2}):?(\d{2})$/;

function instantOf(point: unknown): string | null {
  if (typeof point !== "object" || point === null) return null;
  const date = (point as { date?: unknown }).date;
  if (typeof date !== "string") return null;

  const match = STAMP.exec(date.trim());
  if (!match) return null;
  const [, day, time, sign, hours, minutes] = match;
  return `${day}T${time}${sign}${hours}:${minutes}`;
}
