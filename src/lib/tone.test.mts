import test from "node:test";
import assert from "node:assert/strict";

import { DIRECTION, captionFor, fillPercent, isAlarming, statusOf } from "./tone.ts";

test("beating a protein floor is met, and is never alarming", () => {
  // THE LIVE BUG S72 NAMES. MacroMeter painted 200 g against a 155 g floor
  // `destructive` -- red at the user for doing the thing they were aiming at.
  const status = statusOf("protein", 200, 155, true);
  assert.equal(status, "met");
  assert.equal(isAlarming("protein", status), false);
  assert.equal(isAlarming("protein", status, "strict"), false, "not even in strict mode");
});

test("a floor bar fills and stops, rather than overflowing", () => {
  // Past a floor there is nothing left to say. No overflow, no second bar.
  assert.equal(fillPercent(200, 155), 100);
  assert.equal(fillPercent(155, 155), 100);
  assert.equal(Math.round(fillPercent(77.5, 155)), 50);
});

test("an unfinished day is never short, in either tone", () => {
  // S71, and it is arithmetic rather than a tone: a floor is unmet for most of
  // every day, so "under a floor" only means something once the day is done.
  assert.equal(statusOf("protein", 40, 155, false), "neutral");
  assert.equal(statusOf("protein", 40, 155, true), "short");
  assert.equal(statusOf("calories", 900, 2100, false), "neutral");
});

test("calories are missable in both directions, once the day is done", () => {
  assert.equal(statusOf("calories", 2240, 2100, false), "over", "over is true mid-day too");
  assert.equal(statusOf("calories", 2100, 2100, true), "met");
  assert.equal(statusOf("calories", 1800, 2100, true), "short");
});

test("going over calories is not painted red in calm mode", () => {
  // S70. Red is reserved for destructive ACTIONS and keeps that meaning only
  // because almost nothing else borrows it. The caption carries the fact.
  assert.equal(isAlarming("calories", statusOf("calories", 2240, 2100, true)), false);
  assert.equal(
    isAlarming("calories", statusOf("calories", 2240, 2100, true), "strict"),
    true,
    "strict mode is where a calorie overshoot goes red",
  );
});

test("sodium is the one exception, and goes red in calm mode too", () => {
  // S73. A limit with a health meaning that exists whether or not the user set
  // it -- unlike every other number here, which they chose for themselves.
  const status = statusOf("sodium", 2600, 2300, false);
  assert.equal(status, "over");
  assert.equal(isAlarming("sodium", status), true, "even mid-day, and even calm");
});

test("exactly one metric is a ceiling", () => {
  // Pinned as a count. A second exception is how a calm app becomes a strict
  // one by accretion, and it would arrive as one innocuous table edit.
  const ceilings = Object.entries(DIRECTION).filter(([, d]) => d === "ceiling");
  assert.deepEqual(ceilings.map(([m]) => m), ["sodium"]);
});

test("no goal means nothing to say", () => {
  assert.equal(statusOf("protein", 200, null, true), "neutral");
  assert.equal(statusOf("protein", 200, 0, true), "neutral");
  assert.equal(fillPercent(200, null), 0);
  assert.equal(captionFor("calories", 2240, null), null);
});

test("the caption states the fact and nothing more", () => {
  assert.equal(captionFor("calories", 1900, 2100), "left");
  assert.equal(captionFor("calories", 2240, 2100), "over");
  // A floor that has been reached has no caption at all: "0 left" on a floor
  // you beat by 45 g would be false, and "45 over" would be a complaint.
  assert.equal(captionFor("protein", 200, 155), null);
  assert.equal(captionFor("protein", 100, 155), "left");
});
