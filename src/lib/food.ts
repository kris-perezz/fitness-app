import { scaleMicros, type Micros } from "./micros.ts";

/**
 * Where a food's numbers came from (S6). Not the same question as `verified`,
 * which is one bit ("transcribed from a label") for a question with four
 * answers, and not the same question as an entry's `estimate` flag.
 *
 * S98 corrected what that last one means. It was documented here, in S6 and in
 * S39 as being about QUANTITY -- how much you ate rather than what the food is
 * -- and no code ever implemented that. It is set in two hard-coded places and
 * means "this entry has no catalog row behind it". So the two are still
 * different questions, and this one is still the only answer to "how good are
 * these numbers"; the difference is just not the one that was written down.
 */
export type FoodSource = "seed" | "off" | "label" | "manual" | "recipe" | "cnf";

export type Food = {
  id: string;
  name: string;
  aliases: string[];
  basis: "per_unit" | "per_100g";
  unit: string;
  grams_per_unit: number | null;
  /**
   * What `grams_per_unit` is measured in (S40). A cup of milk is 250 ml, a
   * slice of bread is 37.5 g, and the column name is loose about which -- this
   * says so. For a per_100g food it always equals `unit`.
   */
  weight_unit: "g" | "ml";
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number | null;
  /**
   * S36. Grams of sugar per the food's basis. A FIRST-CLASS COLUMN since 0001,
   * not a micro -- it has had a home in the schema all along and was simply
   * being dropped by every read and write because this type did not declare it.
   */
  sugar_g: number | null;
  /**
   * S36. The vitamins and minerals, keyed by `lib/micros.ts`. Absent is absent:
   * a nutrient with no value is missing rather than zero.
   */
  micros: Micros;
  verified: boolean;
  source: FoodSource;
  /**
   * S97. What this row descended from, where that is not what it is now.
   *
   * Correcting a food's numbers makes them yours, so `source` becomes `manual`
   * -- but a Canadian Nutrient File row carries an attribution obligation that
   * outlives the edit, and dropping it on the way through was the defect. This
   * remembers the ancestry the licence attaches to; `source` still answers how
   * good the numbers are now, and it is still the only one that ranks.
   */
  derived_from?: FoodSource | null;
  /** Set for scanned packaged goods; null for whole foods and recipe outputs. */
  barcode?: string | null;
};

/**
 * The source hierarchy (open decision 2). A composition table describes a
 * reference product; a label describes the packet in your hand, so no database
 * outranks one -- Open Food Facts often carries the US version of a product
 * sold here, and it says itself that it offers no assurance of accuracy.
 *
 * `manual` sits above `off` because the only way a row becomes manual is that
 * somebody looked at the packet and typed what it actually said. `recipe` is
 * computed from ingredients that carry their own sources and never competes for
 * a barcode, so it ranks last by default rather than by judgement.
 */
const SOURCE_RANK: Record<FoodSource, number> = {
  label: 5,
  seed: 4,
  manual: 3,
  // S89. Health Canada's own laboratory data, so above OFF's crowd entries.
  // Below `manual` and `seed` because both of those mean a person read the
  // packet in front of them, where CNF is exact about a REFERENCE food that may
  // not be the one you ate. Reasoning in full in 0022.
  cnf: 2,
  off: 1,
  recipe: 0,
};

/** Higher is more trustworthy. Ties are broken by the caller, not here. */
export function sourceRank(source: FoodSource): number {
  return SOURCE_RANK[source] ?? 0;
}

/** Badge text. Short enough to sit beside a food name on a phone. */
export function sourceLabel(source: FoodSource): string {
  switch (source) {
    case "label":
      return "Label";
    case "seed":
      return "Verified";
    case "manual":
      return "Manual";
    case "off":
      return "Open Food Facts";
    case "cnf":
      return "Health Canada";
    case "recipe":
      return "Recipe";
  }
}

/**
 * One line saying how much salt to take the numbers with.
 *
 * S97. `derivedFrom` is what the row was before it was corrected. It changes
 * only the `manual` case, and only to say what the numbers descend from --
 * everywhere else the source already answers the question by itself. The CNF
 * branch of it is the reason this parameter exists: the licence obligation
 * attaches to the information, so it has to survive the edit that stops the row
 * being a Health Canada row.
 */
export function sourceHint(source: FoodSource, derivedFrom?: FoodSource | null): string {
  switch (source) {
    case "label":
      return "Read from a photo of the nutrition panel and confirmed field by field.";
    case "seed":
      return "Transcribed from the package by hand.";
    case "manual":
      if (derivedFrom === "cnf") {
        // The last sentence is the same LICENCE OBLIGATION the `cnf` branch
        // carries, and dropping it here is precisely the defect S97 fixes.
        // "Started as" rather than "from": the numbers are the user's now.
        return "Entered or corrected by you, starting from a Canadian Nutrient File food. Contains information licensed under the Open Government Licence – Canada.";
      }
      if (derivedFrom === "off") {
        return "Entered or corrected by you, starting from an Open Food Facts product.";
      }
      return "Entered or corrected by you.";
    case "off":
      return "From the Open Food Facts database, unconfirmed. It is often the US version of a product sold here.";
    case "cnf":
      // The second sentence is a LICENCE OBLIGATION, not editorial. See
      // CNF_ATTRIBUTION in lib/cnf.ts.
      return "Laboratory values from the Canadian Nutrient File. They describe a reference food, not the one in your kitchen. Contains information licensed under the Open Government Licence – Canada.";
    case "recipe":
      return "Computed from the recipe's ingredients.";
  }
}

import { searchNamed } from "./search.ts";

export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type Meal = (typeof MEALS)[number];

export type Macros = {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number;
};

/**
 * qty is COUNT for per_unit foods and GRAMS for per_100g foods -- the same
 * convention log_food.py uses, so a number means the same thing in both places.
 */
/**
 * How much of the food's stored figures one portion is (S38).
 *
 * Extracted because three places needed it -- the macros, the micros and the
 * recipe roll-up -- and a factor computed three times is a factor that will
 * eventually be computed two ways.
 */
export function scaleFactor(food: Food, qty: number): number {
  return food.basis === "per_100g" ? qty / 100 : qty;
}

/**
 * The micros one portion carries (S38).
 *
 * Scaled and DENORMALISED onto the entry, never joined back to the food: an
 * entry keeps what it was logged with, so correcting a food tomorrow cannot
 * rewrite what a day contained last month (S7/S19).
 */
export function scaledMicros(food: Food, qty: number): Micros {
  return scaleMicros(food.micros, scaleFactor(food, qty));
}

/** Sugar for one portion, or null where the food never carried a figure. */
export function scaledSugar(food: Food, qty: number): number | null {
  if (food.sugar_g === null) return null;
  return Math.round((food.sugar_g * scaleFactor(food, qty) + Number.EPSILON) * 10) / 10;
}

export function scale(food: Food, qty: number): Macros {
  const factor = scaleFactor(food, qty);
  const r = (n: number | null) => Math.round(((n ?? 0) * factor + Number.EPSILON) * 10) / 10;
  return {
    kcal: Math.round(food.kcal * factor),
    protein_g: r(food.protein_g),
    fat_g: r(food.fat_g),
    carb_g: r(food.carb_g),
    fiber_g: r(food.fiber_g),
    sodium_mg: Math.round((food.sodium_mg ?? 0) * factor),
  };
}

/**
 * Catalog macros are stored unrounded so scaling stays label-exact (see
 * lib/off.ts). Anywhere a raw per-100g figure is shown to a person it goes
 * through here, or the search list reads "49.1840821866013 cal".
 */
export function show(n: number | null): number {
  return Math.round(((n ?? 0) + Number.EPSILON) * 10) / 10;
}

/**
 * What `qty` counts, in the food's own storage convention: grams or millilitres
 * for a per_100g food, and a count of whatever `unit` names for a per_unit one.
 */
export function qtyLabel(food: Food): string {
  if (food.basis !== "per_100g") return food.unit;
  return food.weight_unit === "ml" ? "millilitres" : "grams";
}

/** The measure a food can be poured or weighed out in, spelled out. */
export function measureLabel(food: Food): string {
  return food.weight_unit === "ml" ? "millilitres" : "grams";
}

/**
 * Can this food be expressed BOTH ways -- counted, and measured out? (S40)
 *
 * The question is only ever "does it know what one of it weighs", which is a
 * property of the food, not of how the food happened to arrive. A scanned drink
 * (per_100g, 325 ml a bottle) and a seeded milk (per_unit, 250 ml a cup) both
 * qualify; a homemade dish with no cooked weight does not, and inventing a
 * serving size for it would make "1 serving" mean nothing.
 */
export function canMeasure(food: Food): boolean {
  return food.grams_per_unit != null && food.grams_per_unit > 0;
}

/**
 * `scale()` wants grams for a per_100g food and a count for a per_unit one, so
 * both of a screen's two input modes have to land back on that convention.
 * These are the only two places that conversion happens.
 */
export function qtyFromCount(food: Food, count: number): number {
  return food.basis === "per_100g" ? count * (food.grams_per_unit ?? 0) : count;
}

export function qtyFromMeasure(food: Food, measure: number): number {
  return food.basis === "per_100g" ? measure : measure / (food.grams_per_unit ?? 1);
}

/**
 * Carrying an amount across the count/measure toggle. Independent of basis:
 * one of the thing weighs `grams_per_unit`, whichever way the food is stored.
 */
export function countToMeasure(food: Food, count: number): number {
  return count * (food.grams_per_unit ?? 0);
}

export function measureToCount(food: Food, measure: number): number {
  return measure / (food.grams_per_unit ?? 1);
}

/**
 * What one of this food is called when counted. A per_100g food counts its
 * servings; a per_unit food counts cups, slices or scoops.
 */
export function countLabel(food: Food, n: number): string {
  if (food.basis === "per_100g") return n === 1 ? "serving" : "servings";
  // Left unpluralised: the seed set contains "serving (1/3 cup)" and
  // "serving (3 slices)", which no naive rule survives.
  return food.unit;
}

/** The amount the catalog macros are quoted against, for display. */
export function basisLabel(food: Food): string {
  if (food.basis !== "per_100g") return food.unit;
  return food.unit === "ml" ? "100 ml" : "100 g";
}

/** Ranked substring match over name + aliases. Exact prefix wins. */
export function searchFoods(foods: Food[], query: string): Food[] {
  return searchNamed(foods, query);
}

/**
 * The waking day, not the calendar day: anything logged before 04:00 belongs
 * to the day you woke on.
 */
export function wakingDate(now = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A day of the log, as it comes out of `intake_entries`.
 *
 * Macros are DENORMALISED onto the row at log time (S7/S19), which is why this
 * carries its own numbers rather than a food id and a quantity: correcting a
 * food tomorrow must not rewrite what you ate today.
 */
export type IntakeEntry = Macros & {
  id: string;
  log_date: string;
  /** Null for a one-off typed straight into the log -- there is no catalog row
   * behind it, so there is nothing to correct (S7). */
  food_id: string | null;
  name: string;
  meal: Meal;
  qty: number;
  unit: string;
  estimate: boolean;
};

/**
 * The log's window, in DAYS rather than the months the train and progress tabs
 * count in, because a day arrow moves one day and nobody steps back six months
 * one tap at a time.
 *
 * A month is already generous for a control that moves a day at a time: at this
 * log's density it is around 250 rows, and the window ships inside the page --
 * on the one route the bottom nav prefetches from every other tab. The buffer
 * is what actually has to be big enough, and a week of arrows is far longer
 * than the query behind it takes.
 */
export const LOG_WINDOW_DAYS = 30;

/** Extend once you are this close to either edge of the window held. */
export const LOG_BUFFER_DAYS = 7;

/** Shift a YYYY-MM-DD date string by whole days. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
