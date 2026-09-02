import test from "node:test";
import assert from "node:assert/strict";

import { MICRO_KEYS, addMicros, scaleMicros, toMicros } from "./micros.ts";

test("absent is absent, in both directions", () => {
  // The rule the whole module is built on. "No data" and "contains none of it"
  // are different claims, and only one of them is honest.
  assert.deepEqual(scaleMicros({ iron_mg: 2 }, 1.5), { iron_mg: 3 });
  assert.deepEqual(scaleMicros({}, 1.5), {});

  // A zero is a real measurement and survives; a missing key does not appear.
  assert.deepEqual(scaleMicros({ iron_mg: 0 }, 2), { iron_mg: 0 });
});

test("summing keeps an unknown from being counted as a zero", () => {
  // A recipe of one food with iron and one without must not report the known
  // half as the whole -- but nor may the unknown drag it to zero.
  const summed = addMicros({ iron_mg: 3 }, { calcium_mg: 100 });
  assert.deepEqual(summed, { iron_mg: 3, calcium_mg: 100 });

  assert.deepEqual(addMicros({ iron_mg: 3 }, { iron_mg: 1 }), { iron_mg: 4 });
});

test("a jsonb column is narrowed to keys the app recognises", () => {
  // The failure this prevents is not a crash: it is a `vitaminD_ug` sitting
  // quietly beside a `vit_d_ug`, summing to nothing and looking fine.
  const raw = { iron_mg: 3, vitaminD_ug: 12, nonsense: "x", calcium_mg: "40" };
  assert.deepEqual(toMicros(raw), { iron_mg: 3, calcium_mg: 40 });
});

test("a jsonb column that is not an object is empty, never a crash", () => {
  assert.deepEqual(toMicros(null), {});
  assert.deepEqual(toMicros(undefined), {});
  assert.deepEqual(toMicros([1, 2]), {});
  assert.deepEqual(toMicros("{}"), {});
});

test("values that are not finite are dropped rather than stored", () => {
  // A nutrient a source could not express is one it did not give us.
  assert.deepEqual(toMicros({ iron_mg: Number.NaN, zinc_mg: Number.POSITIVE_INFINITY }), {});
});

test("every key carries its unit, and no two keys name one nutrient", () => {
  // The unit is in the key deliberately: `calcium_mg` cannot be misread as
  // micrograms, and a unit change has to change the key, which is a migration
  // somebody notices rather than a silent factor of a thousand.
  for (const key of MICRO_KEYS) {
    assert.match(key, /_(mg|ug)$/, `${key} does not say its unit`);
  }
  assert.equal(new Set(MICRO_KEYS).size, MICRO_KEYS.length, "a key is repeated");

  // And no nutrient appears under two units, which would be the same trap
  // wearing a different hat.
  const stems = MICRO_KEYS.map((k) => k.replace(/_(mg|ug)$/, ""));
  assert.equal(new Set(stems).size, stems.length, "one nutrient has two keys");
});
