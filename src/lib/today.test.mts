import test from "node:test";
import assert from "node:assert/strict";

import { isTimeZone, todayDate } from "./food.ts";

/** 2026-09-10T05:30:00Z: already tomorrow in UTC, still the 9th in Edmonton. */
const EVENING = new Date("2026-09-10T05:30:00Z");

test("a zoned today is the reader's day, not the host's", () => {
  assert.equal(todayDate(EVENING, "America/Edmonton"), "2026-09-09");
  assert.equal(todayDate(EVENING, "UTC"), "2026-09-10");
});

test("zones east of the line roll over first", () => {
  // The same instant is already the 10th in Tokyo and the 9th in Vancouver,
  // which is the whole reason the server cannot answer this from its own clock.
  assert.equal(todayDate(EVENING, "Asia/Tokyo"), "2026-09-10");
  assert.equal(todayDate(EVENING, "America/Vancouver"), "2026-09-09");
});

test("a zoned date is always YYYY-MM-DD, zero-padded", () => {
  const early = new Date("2026-01-02T12:00:00Z");
  assert.equal(todayDate(early, "UTC"), "2026-01-02");
  assert.match(todayDate(new Date(), "America/Edmonton"), /^\d{4}-\d{2}-\d{2}$/);
});

test("an unknown zone is rejected rather than thrown at Intl", () => {
  assert.equal(isTimeZone("America/Edmonton"), true);
  assert.equal(isTimeZone("Mars/Olympus_Mons"), false);
  assert.equal(isTimeZone(undefined), false);
  assert.equal(isTimeZone(""), false);
});

test("before 04:00 is still the previous day", () => {
  // 08:30Z is 02:30 in Edmonton on the 10th: still the 9th's waking day.
  assert.equal(todayDate(new Date("2026-09-10T08:30:00Z"), "America/Edmonton"), "2026-09-09");
  assert.equal(todayDate(new Date("2026-09-10T10:00:00Z"), "America/Edmonton"), "2026-09-10");
});

test("short dates carry the year only outside the current one", async () => {
  const { shortDate, dayTitle } = await import("./training.ts");
  const thisYear = new Date().getFullYear();
  assert.doesNotMatch(shortDate(`${thisYear}-03-04`), /\d{4}/);
  assert.match(shortDate("2001-03-04"), /2001/);
  assert.equal(dayTitle("2026-10-19", "2026-10-19"), "Today");
  assert.equal(dayTitle("2026-10-18", "2026-10-19"), "Yesterday");
  assert.equal(dayTitle("2026-03-01", "2026-03-02"), "Yesterday");
});
