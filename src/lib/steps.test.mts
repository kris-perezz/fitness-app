import test from "node:test";
import assert from "node:assert/strict";

import { dailyStepTotals } from "./steps.ts";

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
