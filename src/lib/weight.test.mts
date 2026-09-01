/**
 * Tests for the trend maths (S58, S59).
 *
 * `node --test` with Node's own type stripping, so this adds no dependency to a
 * repo that has had no test framework at all. Node 24 is required, which
 * package.json already declares; `npm test` fails loudly on 20.
 *
 * These exist because the smoothing is the one part of the progress tab that
 * cannot be checked by looking at it. A wrong colour is obvious on a phone; a
 * half life that quietly behaves like three days looks entirely plausible and
 * is wrong in the direction that makes people change their diet.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HALF_LIFE_DAYS,
  axisDomain,
  chartSeries,
  MIN_TREND_ENTRIES,
  daysBetween,
  deltaLabel,
  headline,
  rateLabel,
  shiftDays,
  trendSeries,
  weeklyRate,
  windowLabel,
  type WeighIn,
} from "./weight.ts";

/** A reading every `step` days, starting at `from`, walking by `perDay` lb. */
function series(from: string, count: number, start: number, perDay: number, step = 1): WeighIn[] {
  return Array.from({ length: count }, (_, i) => ({
    date: shiftDays(from, i * step),
    weightLb: start + perDay * i * step,
    note: null,
  }));
}

test("an empty log has no trend and no headline", () => {
  assert.deepEqual(trendSeries([]), []);
  assert.equal(headline([]), null);
});

test("the trend starts on the first reading rather than climbing out of zero", () => {
  const [first] = trendSeries(series("2026-08-01", 3, 180, 0));
  assert.equal(first.trendLb, 180);
});

test("half a life closes half the distance, whatever the spacing", () => {
  // Two readings, ten days apart, ten pounds apart: the trend should land
  // halfway. This is the property the half life NAMES, so if it ever stops
  // holding the constant has stopped meaning what the comment says.
  const [, second] = trendSeries([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: shiftDays("2026-08-01", HALF_LIFE_DAYS), weightLb: 190, note: null },
  ]);
  assert.ok(Math.abs(second.trendLb - 195) < 0.001, `got ${second.trendLb}`);
});

test("a gap is measured in calendar days, not in entries", () => {
  // The same two readings, once a day apart and once a fortnight apart. If the
  // smoothing counted entries, these would be identical -- which is exactly the
  // bug S58 is written against.
  const near = trendSeries([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: "2026-08-02", weightLb: 190, note: null },
  ]);
  const far = trendSeries([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: "2026-08-15", weightLb: 190, note: null },
  ]);
  assert.ok(
    far[1].trendLb < near[1].trendLb,
    "a reading after a long gap must move the trend further",
  );
  // And the near one has barely moved: one day at a ten-day half life.
  assert.ok(near[1].trendLb > 199, `got ${near[1].trendLb}`);
});

test("the trend lags the scale on the way down, which is the point", () => {
  const points = trendSeries(series("2026-08-01", 30, 200, -0.1));
  const last = points[points.length - 1];
  assert.ok(last.trendLb > last.weightLb, "a falling trend sits above the reading");
  assert.ok(last.trendLb < 200, "and it is still following it down");
});

test("back-dated entries are sorted rather than trusted in arrival order", () => {
  const ordered = series("2026-08-01", 6, 180, -0.2);
  const shuffled = [ordered[3], ordered[0], ordered[5], ordered[1], ordered[4], ordered[2]];
  assert.deepEqual(trendSeries(shuffled), trendSeries(ordered));
});

test("one reading twice as heavy does not survive as the headline", () => {
  // A fat-fingered 18 for 180 (S56's example). The trend must not follow it off
  // a cliff on one reading -- that is the whole reason the tab shows a trend.
  const entries = [...series("2026-08-01", 10, 180, 0)];
  entries.push({ date: shiftDays("2026-08-01", 10), weightLb: 18, note: null });
  const points = trendSeries(entries);
  const last = points[points.length - 1];
  assert.ok(last.trendLb > 165, `one bad reading moved the trend to ${last.trendLb}`);
});

test("below the floor the headline reports no trend, not a smoothed guess", () => {
  const thin = headline(series("2026-08-01", MIN_TREND_ENTRIES - 1, 180, -0.2));
  assert.ok(thin);
  assert.equal(thin.trendLb, null);
  assert.equal(thin.entryCount, MIN_TREND_ENTRIES - 1);

  const enough = headline(series("2026-08-01", MIN_TREND_ENTRIES, 180, -0.2));
  assert.ok(enough);
  assert.ok(typeof enough.trendLb === "number");
});

test("the headline reports the latest reading, not the largest or the first", () => {
  const h = headline([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: "2026-08-09", weightLb: 180, note: "post-holiday" },
    { date: "2026-08-05", weightLb: 250, note: null },
  ]);
  assert.ok(h);
  assert.equal(h.latest.date, "2026-08-09");
  assert.equal(h.latest.weightLb, 180);
});

test("a rate needs a real span before it is stated", () => {
  assert.equal(weeklyRate([]), null);
  assert.equal(weeklyRate(series("2026-08-01", 3, 180, -0.1)), null);
  // Enough entries, but all inside a week: no rate rather than a wild one.
  assert.equal(weeklyRate(series("2026-08-01", 6, 180, -0.1)), null);
});

test("a steady half-pound week reads as roughly half a pound a week", () => {
  // 8 weeks at -0.5 lb/week, weighed daily. The trend lags, so the measured
  // rate is close to but not exactly the true one -- which is honest.
  const rate = weeklyRate(series("2026-06-01", 56, 200, -0.5 / 7));
  assert.ok(rate);
  assert.ok(Math.abs(rate.lbPerWeek + 0.5) < 0.1, `got ${rate.lbPerWeek}`);
  assert.ok(rate.days >= 21, `window was ${rate.days} days`);
});

test("weighing weekly still yields a rate over the same window", () => {
  // Open decision 3 territory: sparse input must not silently produce nothing.
  const rate = weeklyRate(series("2026-06-01", 8, 200, -0.5 / 7, 7));
  assert.ok(rate, "eight weekly readings should still support a rate");
  assert.ok(rate.lbPerWeek < 0);
});

test("rate labels state the number and judge nothing", () => {
  assert.equal(rateLabel({ lbPerWeek: -0.83, days: 28 }), "−0.8 lb / week");
  assert.equal(rateLabel({ lbPerWeek: 0.25, days: 28 }), "+0.3 lb / week");
  assert.equal(rateLabel({ lbPerWeek: 0, days: 28 }), "0.0 lb / week");
  assert.equal(windowLabel(28), "over the last 4 weeks");
  assert.equal(windowLabel(5), "over 5 days");
});

test("deltas are signed, and the first entry has none", () => {
  assert.equal(deltaLabel(180.4, null), null);
  assert.equal(deltaLabel(180.4, 180), "+0.4");
  assert.equal(deltaLabel(179, 180.2), "−1.2");
  assert.equal(deltaLabel(180.01, 180), "0.0");
});

test("day arithmetic survives a daylight-saving boundary", () => {
  // Canada springs forward on 8 March 2026. Parsed at midnight this span comes
  // back as 0.958 days and rounds correctly by luck; at midday it is exact.
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(shiftDays("2026-03-07", 2), "2026-03-09");
  assert.equal(daysBetween("2026-11-01", "2026-10-31"), -1);
});

test("the chart series fills calendar days and marks the holes as absent", () => {
  const points = chartSeries([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: "2026-08-04", weightLb: 199, note: null },
  ]);
  assert.equal(points.length, 4, "1st through 4th inclusive");
  assert.deepEqual(
    points.map((p) => p.weightLb),
    [200, null, null, 199],
  );
  // The trend breaks with the readings. It is derived from them and has no
  // more claim to continuity, so it must not glide across the hole (S61).
  assert.deepEqual(
    points.map((p) => p.trendLb === null),
    [false, true, true, false],
  );
});

test("a fortnight unweighed is a fortnight of gaps, not a straight line", () => {
  const points = chartSeries([
    { date: "2026-08-01", weightLb: 200, note: null },
    { date: "2026-08-15", weightLb: 195, note: null },
  ]);
  assert.equal(points.filter((p) => p.weightLb === null).length, 13);
});

test("the chart series can be clipped to a window without losing the trend's history", () => {
  // The trend is seeded on the FULL log and only then clipped, so a chart
  // showing the last month does not restart its smoothing at the window edge.
  const all = series("2026-06-01", 40, 200, -0.1);
  const clipped = chartSeries(all, "2026-07-01");
  const full = chartSeries(all);
  assert.ok(clipped.length < full.length);
  const firstClipped = clipped.find((p) => p.trendLb !== null);
  const sameDay = full.find((p) => p.date === firstClipped?.date);
  assert.equal(firstClipped?.trendLb, sameDay?.trendLb);
});

test("the y-axis fits the data and never reaches zero", () => {
  const points = chartSeries(series("2026-08-01", 10, 180, -0.3));
  const [low, high] = axisDomain(points);
  assert.ok(low > 170, `axis floor was ${low}`);
  assert.ok(high < 190, `axis ceiling was ${high}`);
  assert.ok(low < high);
});

test("an empty chart series yields a usable axis rather than Infinity", () => {
  assert.deepEqual(axisDomain([]), [0, 1]);
});
