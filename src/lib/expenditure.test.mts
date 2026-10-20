import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calorieTarget,
  estimateExpenditure,
  type IntakeTotal,
} from "./expenditure.ts";
import { shiftDays, type WeighIn } from "./weight.ts";

const START = "2026-01-01";

/** Daily weigh-ins and intake for someone burning `burn(day)` kcal. */
function simulate(days: number, eat: number, burn: (day: number) => number, startLb = 200) {
  const weighIns: WeighIn[] = [];
  const intake: IntakeTotal[] = [];
  let lb = startLb;
  for (let i = 0; i < days; i += 1) {
    const date = shiftDays(START, i);
    weighIns.push({ date, weightLb: lb, note: null });
    intake.push({ log_date: date, kcal: eat, item_count: 3 });
    const surplus = eat - burn(i);
    lb += surplus / 3500;
  }
  return { weighIns, intake, today: shiftDays(START, days - 1) };
}

test("losing 1 lb a week on 1800 reads as about 2300", () => {
  const { weighIns, intake, today } = simulate(90, 1800, () => 2300);
  const result = estimateExpenditure(weighIns, intake, today);
  assert.ok(result.confident);
  assert.ok(Math.abs(result.kcal! - 2300) < 40, `got ${result.kcal}`);
});

test("a 500 kcal drop moves the estimate slowly, then fully", () => {
  const { weighIns, intake } = simulate(150, 2000, (d) => (d < 60 ? 2000 : 1500));
  const at = (offset: number) =>
    estimateExpenditure(weighIns, intake, shiftDays(START, offset)).kcal!;

  assert.ok(Math.abs(at(59) - 2000) < 30);
  // Three weeks in: moving, nowhere near the full 500.
  const threeWeeks = 2000 - at(80);
  assert.ok(threeWeeks > 150 && threeWeeks < 350, `moved ${threeWeeks}`);
  assert.ok(Math.abs(at(149) - 1500) < 60, `got ${at(149)}`);
});

test("unlogged days hold the estimate rather than dragging it to zero", () => {
  const { weighIns, intake, today } = simulate(60, 1800, () => 2300);
  const before = estimateExpenditure(weighIns, intake, today).kcal!;
  const gap = intake.slice(0, 40);
  const after = estimateExpenditure(weighIns, gap, today);
  assert.ok(after.kcal! > 2000 && Math.abs(after.kcal! - before) < 150);
});

test("too little data gives no estimate", () => {
  const { weighIns, intake, today } = simulate(10, 1800, () => 2300);
  assert.equal(estimateExpenditure(weighIns, intake, today).kcal, null);
});

test("target: 1 lb/week loss is 500 under, 0.5 lb/week gain is 250 over", () => {
  assert.equal(calorieTarget(2300, -1), 1800);
  assert.equal(calorieTarget(2800, 0.5), 3050);
  assert.equal(calorieTarget(2500, 0), 2500);
});
