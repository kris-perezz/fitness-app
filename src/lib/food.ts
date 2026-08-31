/**
 * Where a food's numbers came from (S6). Not the same question as `verified`,
 * which is one bit ("transcribed from a label") for a question with four
 * answers, and not the same question as an entry's `estimate` flag, which is
 * about how much you ate rather than what the food is.
 */
export type FoodSource = "seed" | "off" | "label" | "manual" | "recipe";

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
  verified: boolean;
  source: FoodSource;
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
  label: 4,
  seed: 3,
  manual: 2,
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
    case "recipe":
      return "Recipe";
  }
}

/** One line saying how much salt to take the numbers with. */
export function sourceHint(source: FoodSource): string {
  switch (source) {
    case "label":
      return "Read from a photo of the nutrition panel and confirmed field by field.";
    case "seed":
      return "Transcribed from the package by hand.";
    case "manual":
      return "Entered or corrected by you.";
    case "off":
      return "From the Open Food Facts database, unconfirmed. It is often the US version of a product sold here.";
    case "recipe":
      return "Computed from the recipe's ingredients.";
  }
}

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
export function scale(food: Food, qty: number): Macros {
  const factor = food.basis === "per_100g" ? qty / 100 : qty;
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
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { food: Food; score: number }[] = [];

  for (const food of foods) {
    const haystacks = [food.name.toLowerCase(), ...food.aliases.map((a) => a.toLowerCase())];
    let best = Infinity;
    for (const h of haystacks) {
      if (h === q) best = Math.min(best, 0);
      else if (h.startsWith(q)) best = Math.min(best, 1);
      else if (h.includes(q)) best = Math.min(best, 2);
    }
    if (best < Infinity) scored.push({ food, score: best });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name))
    .slice(0, 20)
    .map((s) => s.food);
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

/** Shift a YYYY-MM-DD date string by whole days. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
