import test from "node:test";
import assert from "node:assert/strict";

import { SERIES, countDomain, dayTick, enoughToPlot, measureDomain } from "./chart.ts";

test("a measure axis is fitted, never zero-based", () => {
  // The rule the whole contract exists for: a 0-200 lb axis draws a real cut as
  // a horizontal line. Six pounds of range must occupy the chart, not 3% of it.
  const [low, high] = measureDomain([161.8, 163.2, 166.4, 167.0]);
  assert.equal(low, 160);
  assert.equal(high, 168);
  assert.ok(low > 0, "a bodyweight axis must not start at zero");
});

test("a measure axis ignores the days with no reading", () => {
  // A gap is not a zero. Coercing one null would drag the floor to 0 and
  // flatten every real difference above it.
  assert.deepEqual(measureDomain([161.8, null, 163.2, null]), [160, 165]);
  assert.deepEqual(measureDomain([]), [0, 1]);
});

test("a count axis starts at zero and rounds the top up to a step", () => {
  // Zero is a real number of sets, so hiding it exaggerates every difference
  // above it. Rounding keeps the ruler still: 41 sets and 44 sets share a top.
  assert.deepEqual(countDomain([41, 12, 3]), [0, 50]);
  assert.deepEqual(countDomain([44, 12, 3]), [0, 50]);
});

test("a count axis holds a floor, so one set does not fill the width", () => {
  // Without the floor the axis fits its single value, which is exactly the
  // per-view normalisation that made a 3-set month look like a 300-set one.
  assert.deepEqual(countDomain([1]), [0, 10]);
  assert.deepEqual(countDomain([]), [0, 10]);
});

test("enough to plot counts readings, not calendar days", () => {
  // A series padded to one entry per day is mostly nulls; its length says
  // nothing about how much was measured.
  const month = Array.from({ length: 30 }, () => null) as (number | null)[];
  month[0] = 160;
  month[29] = 158;
  assert.equal(enoughToPlot(month, 5), false, "two readings is not a trend");
  assert.equal(enoughToPlot(month, 2), true);
});

test("gaps stay gaps, and no series animates or offers a hover dot", () => {
  // Pinned as data because these are the defaults every chart spreads. A future
  // chart that wants connectNulls has to say so at its own call site, in
  // writing, rather than inheriting it by accident.
  assert.equal(SERIES.connectNulls, false);
  assert.equal(SERIES.isAnimationActive, false);
  assert.equal(SERIES.activeDot, false);
});

test("a date tick reads as a day, and cannot slip a day by timezone", () => {
  // Parsed at midday: `new Date("2026-09-03")` is UTC midnight, which is the
  // 2nd of September anywhere west of Greenwich.
  assert.match(dayTick("2026-09-03"), /3/);
  assert.match(dayTick("2026-09-03"), /Sep/);
});
