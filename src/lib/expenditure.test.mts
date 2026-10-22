import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calorieTarget,
  estimateExpenditure,
  rateLb,
  type IntakeTotal,
} from "./expenditure.ts";
import { shiftDays, type WeighIn } from "./weight.ts";

// A Sunday, so weekly checkpoints land on known days.
const START = "2026-01-04";

/**
 * Daily weigh-ins and intake for someone burning `burn(day)` kcal at the start
 * weight, and 10 kcal/day less per lb lost, as real burn does.
 */
function simulate(days: number, eat: (day: number) => number, burn: (day: number) => number, startLb = 200) {
  const weighIns: WeighIn[] = [];
  const intake: IntakeTotal[] = [];
  let lb = startLb;
  for (let i = 0; i < days; i += 1) {
    const date = shiftDays(START, i);
    weighIns.push({ date, weightLb: lb, note: null });
    intake.push({ log_date: date, kcal: eat(i), item_count: 3 });
    lb += (eat(i) - (burn(i) + 10 * (lb - startLb))) / 3500;
  }
  return { weighIns, intake, today: shiftDays(START, days - 1), lb };
}

const truth = (burn: number, startLb: number, lb: number) => burn + 10 * (lb - startLb);

test("losing about 1 lb a week on 1800 reads as the true burn", () => {
  const { weighIns, intake, today, lb } = simulate(91, () => 1800, () => 2300);
  const result = estimateExpenditure(weighIns, intake, today);
  assert.ok(result.confident);
  assert.ok(Math.abs(result.kcal! - truth(2300, 200, lb)) < 40, `got ${result.kcal}`);
});

test("a sudden 500 kcal drop in burn is believed within three months", () => {
  const { weighIns, intake, lb } = simulate(150, () => 2000, (d) => (d < 60 ? 2000 : 1500));
  const at = (offset: number) => estimateExpenditure(weighIns, intake, shiftDays(START, offset)).points.at(-1)!.kcal;
  assert.ok(Math.abs(at(59) - 2000) < 30, `before ${at(59)}`);
  const moved = 2000 - at(80);
  assert.ok(moved > 100, `moved ${moved} in three weeks`);
  assert.ok(Math.abs(at(149) - truth(1500, 200, lb)) < 60, `after ${at(149)}`);
});

test("unlogged days hold the estimate rather than dragging it to zero", () => {
  const { weighIns, intake, today } = simulate(63, () => 1800, () => 2300);
  const before = estimateExpenditure(weighIns, intake, today).kcal!;
  const after = estimateExpenditure(weighIns, intake.slice(0, 40), today);
  assert.ok(after.kcal! > 2000 && Math.abs(after.kcal! - before) < 150, `${before} vs ${after.kcal}`);
});

test("too little history gives no estimate", () => {
  const { weighIns, intake, today } = simulate(10, () => 1800, () => 2300);
  assert.equal(estimateExpenditure(weighIns, intake, today).kcal, null);
});

test("the shown estimate only changes on Sundays", () => {
  const { weighIns, intake } = simulate(60, () => 1800, () => 2300);
  const sunday = shiftDays(START, 35);
  const shown = (date: string) => estimateExpenditure(weighIns, intake, date).kcal;
  const atSunday = estimateExpenditure(weighIns, intake, sunday);
  assert.equal(atSunday.kcal, atSunday.points.at(-1)!.kcal);
  for (let i = 1; i < 7; i += 1) assert.equal(shown(shiftDays(sunday, i)), atSunday.kcal);
  assert.notEqual(shown(shiftDays(sunday, 7)), atSunday.kcal);
});

test("target: 1 lb/week loss is 500 under, 0.5 lb/week gain is 250 over", () => {
  assert.equal(calorieTarget(2300, -1), 1800);
  assert.equal(calorieTarget(2800, 0.5), 3050);
  assert.equal(calorieTarget(2500, 0), 2500);
});

test("rate: 0.5% of 200 lb is 1 lb a week", () => {
  assert.equal(rateLb(0.5, 200), 1);
  assert.equal(rateLb(-1, 150), -1.5);
});
