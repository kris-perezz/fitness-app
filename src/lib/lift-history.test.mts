import test from "node:test";
import assert from "node:assert/strict";

import { enoughSessions, hasRepBand, liftHistory, repsOnly } from "./training.ts";
import type { WorkoutSet } from "./training.ts";

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({
    id: crypto.randomUUID(),
    workout_exercise_id: "slot",
    set_index: 0,
    reps: 5,
    load_lb: 225,
    rir: null,
    skipped: false,
    set_type: "straight",
    ...over,
  }) as WorkoutSet;

test("the same lift twice in one session is one point, not two", () => {
  // Heavy then a back-off is deliberately two slots in the schema (0009).
  // Plotting both would put two dots on one day and read as a decline.
  const { points, sessions } = liftHistory([
    { log_date: "2026-09-01", sets: [set({ reps: 3, load_lb: 275 })] },
    { log_date: "2026-09-01", sets: [set({ reps: 10, load_lb: 185 })] },
  ]);

  assert.equal(points.length, 1);
  assert.equal(sessions[0].sets.length, 2, "both slots' sets are still listed");
});

test("rep bands never share a line", () => {
  // The whole reason there are two series. A 30-rep set estimates absurdly high
  // under Brzycki, and merging the bands would rate it above a heavy triple.
  const { points } = liftHistory([
    { log_date: "2026-09-01", sets: [set({ reps: 3, load_lb: 275 })] },
    { log_date: "2026-09-08", sets: [set({ reps: 20, load_lb: 140 })] },
  ]);

  assert.ok(points[0].e1rm !== null);
  assert.equal(points[0].repBand, null, "a heavy triple contributes nothing to the rep band");
  assert.equal(points[1].e1rm, null, "a 20-rep set contributes nothing to the max band");
  assert.ok(points[1].repBand !== null);

  // And the merged mistake, stated as a number so it cannot creep back: a
  // 140 x 20 estimates ABOVE a genuine 275 x 3.
  assert.ok(
    points[1].repBand! > points[0].e1rm!,
    "this is exactly why the two bands must not share an axis series",
  );
});

test("a set past the plot limit never stretches the axis", () => {
  const { points, sessions } = liftHistory([
    { log_date: "2026-09-01", sets: [set({ reps: 30, load_lb: 140 })] },
  ]);
  assert.equal(points[0].repBand, null);
  assert.equal(points[0].e1rm, null);
  assert.equal(sessions[0].sets.length, 1, "the set is still listed");
});

test("warm-ups and skipped sets never reach the chart", () => {
  const { points, sessions } = liftHistory([
    {
      log_date: "2026-09-01",
      sets: [
        set({ reps: 10, load_lb: 95, set_type: "warmup" }),
        set({ reps: 1, load_lb: 315, skipped: true }),
        set({ reps: 5, load_lb: 225 }),
      ],
    },
  ]);

  assert.equal(sessions[0].sets.length, 1);
  assert.equal(points[0].e1rm, Math.round((225 * 36) / (37 - 5)));
});

test("a slot opened and never filled in contributes no point", () => {
  // Zero reps is not a lift of zero; it is a row somebody left blank.
  const { points } = liftHistory([
    { log_date: "2026-09-01", sets: [set({ reps: null, load_lb: 0 })] },
  ]);
  assert.equal(points.length, 0, "a blank set is not a session's lift, not even a zero");
});

test("points run forwards and the set list runs backwards", () => {
  // A chart reads left to right in time; a list of sessions reads newest first.
  const { points, sessions } = liftHistory([
    { log_date: "2026-09-08", sets: [set()] },
    { log_date: "2026-09-01", sets: [set()] },
  ]);

  assert.deepEqual(points.map((p) => p.date), ["2026-09-01", "2026-09-08"]);
  assert.deepEqual(sessions.map((s) => s.date), ["2026-09-08", "2026-09-01"]);
});

test("the second series only appears for an exercise that has one", () => {
  const heavy = liftHistory([{ log_date: "2026-09-01", sets: [set({ reps: 5 })] }]);
  assert.equal(hasRepBand(heavy.points), false);

  const high = liftHistory([{ log_date: "2026-09-01", sets: [set({ reps: 20 })] }]);
  assert.equal(hasRepBand(high.points), true);
});

test("bodyweight lifts chart by best reps, since a zero load estimates nothing", () => {
  const days = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-08"];
  const { points } = liftHistory(
    days.map((log_date, i) => ({
      log_date,
      sets: [set({ load_lb: 0, reps: 8 + i }), set({ load_lb: 0, reps: 6 })],
    })),
  );
  assert.deepEqual(points.map((p) => p.reps), [8, 9, 10, 11]);
  assert.ok(repsOnly(points));
  assert.ok(enoughSessions(points));
});
