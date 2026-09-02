import test from "node:test";
import assert from "node:assert/strict";

import { MIN_LOGGED_DAYS, adherence, weeklyEnergy } from "./energy.ts";
import type { IntakeDay } from "./trends.ts";
import type { WeighIn } from "./weight.ts";

const day = (log_date: string, kcal = 2000): IntakeDay => ({
  log_date,
  kcal,
  protein_g: 150,
  estimate_count: 0,
  item_count: 5,
});

/** Monday 2026-08-31 through Sunday 2026-09-06. */
const WEEK = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
const FRIDAY = new Date(2026, 8, 4);

test("weeks start on Monday, whatever day it is today", () => {
  // Arbitrary but it has to be STABLE: a boundary that moved with today's
  // weekday would reshuffle every row each time the screen was opened.
  const weeks = weeklyEnergy([], [], 2, FRIDAY);
  assert.equal(weeks[0].weekStart, "2026-08-31");
  assert.equal(weeks[1].weekStart, "2026-08-24");
});

test("a Sunday belongs to the week that started six days earlier", () => {
  // getDay() is 0 on Sunday, which is the END of the week here. Off by one in
  // the obvious direction would make Sunday its own week of one day.
  const weeks = weeklyEnergy([], [], 1, new Date(2026, 8, 6));
  assert.equal(weeks[0].weekStart, "2026-08-31");
});

test("a thinly logged week is excluded, and says how thin", () => {
  // Three logged days is not a week of eating. The unlogged days are
  // disproportionately the big ones, so a thin week reads as a deficit that
  // never happened.
  const days = WEEK.slice(0, 3).map((d) => day(d));
  const weeks = weeklyEnergy(days, [], 1, FRIDAY);

  assert.equal(weeks[0].included, false);
  assert.equal(weeks[0].loggedDays, 3);
  assert.equal(weeks[0].avgKcal, null, "an excluded week must not report a number");
  assert.equal(weeks[0].changeLb, null);
});

test("the gate is at five days, and five is enough", () => {
  const weeks = weeklyEnergy(WEEK.slice(0, MIN_LOGGED_DAYS).map((d) => day(d)), [], 1, FRIDAY);
  assert.equal(weeks[0].included, true);
  assert.equal(weeks[0].loggedDays, MIN_LOGGED_DAYS);
});

test("the average is over logged days, never over seven", () => {
  // Dividing by seven turns every missed day into a fast -- the same lie the
  // gate exists to catch, hidden inside a number that still looks plausible.
  const days = WEEK.slice(0, 5).map((d) => day(d, 2000));
  const weeks = weeklyEnergy(days, [], 1, FRIDAY);
  assert.equal(weeks[0].avgKcal, 2000, "five days at 2000 averages 2000, not 1429");
});

test("the weekly change reads the trend, not the raw readings", () => {
  // Two readings a week apart with noise between them: the change has to come
  // off the smoothed series or a salty Saturday becomes a gain.
  const entries: WeighIn[] = [
    { date: "2026-08-31", weightLb: 170, note: null },
    { date: "2026-09-03", weightLb: 173, note: null },
    { date: "2026-09-06", weightLb: 169, note: null },
  ];
  const weeks = weeklyEnergy(WEEK.map((d) => day(d)), entries, 1, FRIDAY);

  assert.equal(weeks[0].included, true);
  assert.ok(weeks[0].changeLb !== null);
  // The raw endpoints say -1.0. The trend, seeded on the first reading and
  // pulled up by the middle one, has not fallen that far.
  assert.ok(weeks[0].changeLb! > -1.0, "a trend change must not equal the raw difference");
});

test("one weigh-in in a week is not a change", () => {
  const entries: WeighIn[] = [{ date: "2026-09-02", weightLb: 170, note: null }];
  const weeks = weeklyEnergy(WEEK.map((d) => day(d)), entries, 1, FRIDAY);
  assert.equal(weeks[0].changeLb, null);
});

test("a week with no food logged at all is excluded rather than zero", () => {
  const weeks = weeklyEnergy([], [], 1, FRIDAY);
  assert.equal(weeks[0].included, false);
  assert.equal(weeks[0].avgKcal, null);
  assert.equal(weeks[0].loggedDays, 0);
});

test("adherence counts logged days in the window and sessions this week", () => {
  // Friday 2026-09-04. The window is the trailing 14 days; the sessions are
  // "this week", which starts Monday 2026-08-31.
  const days = [day("2026-09-01"), day("2026-09-02"), day("2026-08-20")];
  const sessions = ["2026-09-01", "2026-09-03", "2026-08-25"];

  const a = adherence(days, sessions, FRIDAY);
  assert.equal(a.loggedDays, 2, "2026-08-20 is outside the 14-day window");
  assert.equal(a.windowDays, 14);
  assert.equal(a.sessionsThisWeek, 2, "2026-08-25 is last week");
});

test("a day logged then emptied does not count as adherence", () => {
  const a = adherence([{ ...day("2026-09-01"), item_count: 0 }], [], FRIDAY);
  assert.equal(a.loggedDays, 0);
});

test("two sessions on one day count once", () => {
  // S52 allows one session a day, but the query feeding this does not promise it.
  const a = adherence([], ["2026-09-01", "2026-09-01"], FRIDAY);
  assert.equal(a.sessionsThisWeek, 1);
});
