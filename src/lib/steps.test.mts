import test from "node:test";
import assert from "node:assert/strict";

import { dailyStepTotals, healthSamples } from "./steps.ts";

/** The shape Health Auto Export documents, hourly buckets and all. */
const payload = {
  data: {
    metrics: [
      {
        name: "step_count",
        units: "count",
        data: [
          { qty: 1200, date: "2026-09-03 08:00:00 -0600" },
          { qty: 3400, date: "2026-09-03 13:00:00 -0600" },
          { qty: 900, date: "2026-09-04 07:00:00 -0600" },
        ],
      },
      {
        name: "heart_rate",
        units: "count/min",
        data: [{ qty: 62, date: "2026-09-03 08:00:00 -0600" }],
      },
    ],
    workouts: [],
  },
};

test("hourly buckets are summed into one total per day", () => {
  assert.deepEqual(dailyStepTotals(payload), [
    { date: "2026-09-03", steps: 4600 },
    { date: "2026-09-04", steps: 900 },
  ]);
});

test("only the step metric counts", () => {
  // The automation posts whatever metrics it was configured with, and a heart
  // rate summed into a step count is the kind of wrong nothing looks wrong.
  const only = { data: { metrics: [payload.data.metrics[1]] } };
  assert.deepEqual(dailyStepTotals(only), []);
});

test("the day is read off the string, never through a Date", () => {
  // 23:30 in Edmonton is already tomorrow in UTC. Parsing this timestamp and
  // asking a server in another zone for the day moves the steps a day forward.
  const late = {
    data: {
      metrics: [
        {
          name: "step_count",
          units: "count",
          data: [{ qty: 500, date: "2026-09-03 23:30:00 -0600" }],
        },
      ],
    },
  };
  assert.deepEqual(dailyStepTotals(late), [{ date: "2026-09-03", steps: 500 }]);
});

test("a broken bucket is dropped, not counted as zero", () => {
  const messy = {
    data: {
      metrics: [
        {
          name: "step_count",
          units: "count",
          data: [
            { qty: 1000, date: "2026-09-03 08:00:00 -0600" },
            { qty: -5, date: "2026-09-03 09:00:00 -0600" },
            { qty: "lots", date: "2026-09-03 10:00:00 -0600" },
            { qty: 200, date: "not a date" },
            { date: "2026-09-03 11:00:00 -0600" },
          ],
        },
      ],
    },
  };
  assert.deepEqual(dailyStepTotals(messy), [{ date: "2026-09-03", steps: 1000 }]);
});

test("anything that is not the documented shape yields nothing", () => {
  // The endpoint is public and takes whatever is posted to it, so the parser
  // has to return an empty list rather than throw on every wrong body.
  for (const junk of [null, undefined, 42, "steps", [], {}, { data: {} }, { data: { metrics: 7 } }]) {
    assert.deepEqual(dailyStepTotals(junk), []);
  }
});

test("every metric is kept, at the grain it arrived", () => {
  // The step roll-up is one reading of the payload; this is the other. A heart
  // rate is dropped from the daily total and MUST survive here, or turning a
  // metric on in the app records nothing anywhere.
  const samples = healthSamples(payload);
  assert.equal(samples.length, 4);
  assert.deepEqual(
    samples.map((s) => s.metric),
    ["step_count", "step_count", "step_count", "heart_rate"],
  );
});

test("a timestamp becomes an instant without losing its offset", () => {
  const [first] = healthSamples(payload);
  assert.equal(first.measured_at, "2026-09-03T08:00:00-06:00");
  assert.equal(first.log_date, "2026-09-03");
  assert.equal(new Date(first.measured_at).toISOString(), "2026-09-03T14:00:00.000Z");
});

test("the point's own fields survive, minus the date", () => {
  const [first] = healthSamples(payload);
  assert.deepEqual(first.value, { qty: 1200 });
  assert.equal(first.units, "count");
  assert.ok(!("date" in first.value), "the date has columns of its own");
});

test("a richer point keeps every field it came with", () => {
  // Not every metric is a single quantity: a heart rate can arrive as three
  // numbers, and a schema that assumed `qty` would silently drop two of them.
  const rich = {
    data: {
      metrics: [
        {
          name: "heart_rate",
          units: "count/min",
          data: [{ Min: 48, Avg: 62, Max: 140, date: "2026-09-03 08:00:00 -0600" }],
        },
      ],
    },
  };
  assert.deepEqual(healthSamples(rich)[0].value, { Min: 48, Avg: 62, Max: 140 });
});

test("an unparseable timestamp drops the reading rather than guessing", () => {
  const bad = {
    data: {
      metrics: [{ name: "step_count", units: "count", data: [{ qty: 10, date: "yesterday" }] }],
    },
  };
  assert.deepEqual(healthSamples(bad), []);
});
