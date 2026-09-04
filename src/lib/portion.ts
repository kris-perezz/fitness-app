/**
 * The itemised plate, and the arithmetic over it (S102).
 *
 * WHY THIS IS ITS OWN FILE AND NOT PART OF lib/describe.ts. Both sides of the
 * feature need this arithmetic and only one of them may import that file:
 * describe.ts reads a secret and pulls in node:crypto, so a client component
 * touching anything but its types would drag both into the browser bundle.
 * Everything here is pure and has no imports at all, which is what lets the
 * server sum an estimate on arrival and the phone re-sum it after a correction
 * WITH THE SAME CODE. Two implementations of one sum is the bug this avoids:
 * they would agree on the day they were written and drift afterwards.
 */

/**
 * One named food on the plate, with the mass the estimate assumed for it.
 *
 * `grams` is null only when a mass is not the thing that varies -- an egg, a
 * slice. Such a row still counts toward the total; it simply offers nothing to
 * scale by, which is honest, because no mass was guessed there to be wrong.
 */
export type Component = {
  item: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number;
};

/** The five fields that are not identity -- everything a total is taken over. */
export type Macro = keyof Omit<Component, "item" | "grams">;

export const MACROS: Macro[] = [
  "kcal",
  "protein_g",
  "fat_g",
  "carb_g",
  "fiber_g",
  "sodium_mg",
];

/**
 * A component beside what the user now says its mass was.
 *
 * `base` is never mutated and `grams` is a string because that is what an input
 * holds -- including mid-edit states like "" and "1." that are not numbers yet.
 * Keeping the original is what makes a correction cheap: the row's macros are
 * its own macros scaled by how far the mass moved, so re-weighing the fries
 * re-derives every total locally rather than asking the model a second time,
 * which would return a second answer to a question that changed in one place.
 */
export type Row = { base: Component; grams: string };

/** An untouched row per component: what the estimate said, before any correction. */
export function rowsFrom(components: Component[]): Row[] {
  return components.map((base) => ({
    base,
    grams: base.grams === null ? "" : String(base.grams),
  }));
}

/**
 * How far this row moved from what was assumed.
 *
 * A blank or unusable box is 0, not 1. The six macro fields already treat an
 * empty box as zero, and it gives "I did not eat that" a way to be said without
 * a delete control on every row.
 */
export function scaleOf(row: Row): number {
  if (row.base.grams === null) return 1;
  const grams = Number(row.grams);
  if (row.grams.trim() === "" || !Number.isFinite(grams) || grams < 0) return 0;
  return grams / row.base.grams;
}

/** One row's contribution at its current mass. */
export function scaled(row: Row, field: Macro): number {
  return row.base[field] * scaleOf(row);
}

/**
 * THE ONLY PLACE A TOTAL IS PRODUCED, on either side of the network.
 *
 * Totals are a sum, and a sum is arithmetic this codebase does not ask a
 * language model to perform -- the model itemises and this adds up. The
 * consequence that matters on screen: an uncorrected estimate and a corrected
 * one come out of the same function, so the numbers cannot round differently
 * before and after the user touches a weight.
 */
export function totals(rows: Row[]): Record<Macro, number> {
  const out = {} as Record<Macro, number>;
  for (const field of MACROS) {
    out[field] = rows.reduce((acc, row) => acc + scaled(row, field), 0);
  }
  return out;
}
