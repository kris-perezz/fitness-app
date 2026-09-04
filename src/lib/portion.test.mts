import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsFrom, scaleOf, totals, type Component } from "./portion.ts";

/**
 * The real answer for a pub plate of smoked pulled pork poutine, as returned by
 * the estimator. The fries mass is the number that was wrong on the measured
 * plate -- 300g assumed onto a small oval side plate -- so it is the number
 * every test here corrects.
 */
const POUTINE: Component[] = [
  { item: "French fries", grams: 300, kcal: 930, protein_g: 10, fat_g: 45, carb_g: 122, fiber_g: 10, sodium_mg: 750 },
  { item: "Cheese curds", grams: 90, kcal: 290, protein_g: 20, fat_g: 24, carb_g: 2, fiber_g: 0, sodium_mg: 500 },
  { item: "Smoked pulled pork", grams: 150, kcal: 390, protein_g: 39, fat_g: 24, carb_g: 3, fiber_g: 0, sodium_mg: 1200 },
  { item: "Poutine gravy", grams: 150, kcal: 120, protein_g: 4, fat_g: 7, carb_g: 10, fiber_g: 1, sodium_mg: 1100 },
];

test("S102: an uncorrected plate totals to the sum of its components", () => {
  const t = totals(rowsFrom(POUTINE));
  assert.equal(t.kcal, 1730);
  assert.equal(t.protein_g, 73);
  assert.equal(t.sodium_mg, 3550);
});

test("S102: correcting one weight moves only that component's share", () => {
  const rows = rowsFrom(POUTINE);
  rows[0] = { ...rows[0], grams: "150" };
  const t = totals(rows);
  // Half the fries: 1730 - 465. The other three are untouched to the calorie.
  assert.equal(t.kcal, 1265);
  assert.equal(t.protein_g, 68);
  assert.equal(t.fiber_g, 6);
  // Fries carry 750 of the sodium, so half of that comes off and no more.
  assert.equal(t.sodium_mg, 3175);
});

test("S102: zeroing a weight removes the component without removing the row", () => {
  const rows = rowsFrom(POUTINE);
  rows[1] = { ...rows[1], grams: "0" };
  assert.equal(totals(rows).kcal, 1730 - 290);
  // The row is still there to be typed back into.
  assert.equal(rows.length, 4);
  assert.equal(rows[1].base.kcal, 290);
});

test("S102: a half-typed box reads as nothing, not as the original guess", () => {
  // Mid-edit the input is momentarily "" or "1." -- neither is a mass, and
  // silently falling back to the assumed weight would show a total the user
  // did not ask for while they are still typing the one they want.
  for (const partial of ["", "   ", "abc", "-40"]) {
    const rows = rowsFrom(POUTINE);
    rows[0] = { ...rows[0], grams: partial };
    assert.equal(scaleOf(rows[0]), 0, partial);
    assert.equal(totals(rows).kcal, 1730 - 930, partial);
  }
});

test("S102: a component with no assumed mass counts in full and cannot be scaled", () => {
  const egg: Component = {
    item: "Fried egg",
    grams: null,
    kcal: 90,
    protein_g: 6,
    fat_g: 7,
    carb_g: 0,
    fiber_g: 0,
    sodium_mg: 95,
  };
  const rows = rowsFrom([egg]);
  assert.equal(rows[0].grams, "");
  // Blank here means "no mass was guessed", NOT "zero" -- the opposite of what
  // a blank box means on a row that does have one.
  assert.equal(scaleOf(rows[0]), 1);
  assert.equal(totals(rows).kcal, 90);
});

test("S102: an empty plate totals to zero rather than to NaN", () => {
  const t = totals([]);
  assert.equal(t.kcal, 0);
  assert.equal(t.sodium_mg, 0);
});
