import test from "node:test";
import assert from "node:assert/strict";

import {
  dailySeries,
  estimateShare,
  loggedDays,
  trendsWindow,
  type IntakeDay,
} from "./trends.ts";

const day = (log_date: string, over: Partial<IntakeDay> = {}): IntakeDay => ({
  log_date,
  kcal: 2100,
  protein_g: 160,
  estimate_count: 0,
  item_count: 6,
  ...over,
});

test("the window rolls back from today, never snapping to the 1st", () => {
  // The bug S62 had to be corrected for: a month-to-date window is one day long
  // on the 1st and thirty-one on the 31st, so the same screen means something
  // different depending on when it is opened.
  assert.deepEqual(trendsWindow("2026-09-01", 30), { from: "2026-08-03", to: "2026-09-01" });
  assert.deepEqual(trendsWindow("2026-09-30", 30), { from: "2026-09-01", to: "2026-09-30" });
});

test("the window survives a month boundary and a leap year", () => {
  assert.deepEqual(trendsWindow("2026-03-01", 1), { from: "2026-03-01", to: "2026-03-01" });
  assert.deepEqual(trendsWindow("2024-03-01", 2), { from: "2024-02-29", to: "2024-03-01" });
});

test("an unlogged day is a gap, not a zero", () => {
  // The whole point of S83. A zero bar says you ate nothing; a gap says the app
  // was closed. Only one of those is a thing the log can know.
  const series = dailySeries([day("2026-09-01"), day("2026-09-03")], "2026-09-01", "2026-09-03");

  assert.equal(series.length, 3);
  assert.equal(series[0].kcal, 2100);
  assert.equal(series[1].kcal, null, "the unlogged middle day must be null");
  assert.equal(series[1].protein_g, null);
  assert.equal(series[2].kcal, 2100);
});

test("a day whose entries were all deleted reads as unlogged", () => {
  const series = dailySeries([day("2026-09-01", { item_count: 0, kcal: 0 })], "2026-09-01", "2026-09-01");
  assert.equal(series[0].kcal, null);
});

test("the series is built from the calendar, not from the rows", () => {
  // Iterating the rows would close every gap by omitting it -- and the gaps are
  // the shape this chart exists to show.
  const series = dailySeries([], "2026-09-01", "2026-09-05");
  assert.equal(series.length, 5);
  assert.ok(series.every((p) => p.kcal === null));
});

test("the estimate share counts entries, not days", () => {
  // A day with one guessed entry out of twelve is not "a guessed day".
  const days = [
    day("2026-09-01", { item_count: 10, estimate_count: 2 }),
    day("2026-09-02", { item_count: 10, estimate_count: 0 }),
  ];
  assert.deepEqual(estimateShare(days), { entries: 20, estimates: 2, percent: 10 });
});

test("an empty window is 0%, never NaN", () => {
  assert.deepEqual(estimateShare([]), { entries: 0, estimates: 0, percent: 0 });
});

test("logged days is the denominator the rest of the screen leans on", () => {
  const days = [day("2026-09-01"), day("2026-09-02", { item_count: 0 })];
  assert.equal(loggedDays(days), 1);
});
