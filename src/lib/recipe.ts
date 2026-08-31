/**
 * Recipe maths (S15-S17, S21).
 *
 * A recipe is a named list of ingredients plus how many servings the pot made.
 * Two different quantities live here and must not be confused:
 *
 *   - MACROS are divided by serving count, never by weight. Water leaving a
 *     simmer carries no calories, so one sixth of the pot is one sixth of the
 *     macros no matter what the pot ends up weighing (S16). "Correcting" macros
 *     by cooked weight would invent or destroy calories.
 *   - GRAMS only ever describe a *portion size* (S17) and sanity check the cook
 *     (S21). They never feed back into the macro split.
 *
 * Ingredient qty follows the same convention as `intake_entries.qty` and
 * `scale()` in ./food: a COUNT for per_unit foods, GRAMS for per_100g foods.
 * Grams are derived, and a per_unit food with a null `grams_per_unit` has an
 * unknown weight -- represented as such, never quietly as zero.
 */

import { scale, type Food, type Macros } from "./food";

/** A stored ingredient row resolved against its food. */
export type RecipeLine = {
  food: Food;
  /** COUNT for per_unit foods, GRAMS for per_100g foods. */
  qty: number;
};

export type RecipeDetails = {
  name: string;
  servings: number;
  /** Optional (S17); null when the cook was never weighed. */
  cooked_weight_g: number | null;
};

/**
 * Weight of the raw ingredients, or the foods that made it unknowable.
 * A discriminated result rather than a nullable number: the UI has to name the
 * foods blocking the yield check so the user can go fix them.
 */
export type RawWeight =
  | { known: true; grams: number }
  | { known: false; missing: string[] };

const EMPTY: Macros = {
  kcal: 0,
  protein_g: 0,
  fat_g: 0,
  carb_g: 0,
  fiber_g: 0,
  sodium_mg: 0,
};

/** Grams round to 0.1 the way `scale` does; kcal and sodium stay whole. */
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/**
 * Macros for the whole dish. Delegates every per-ingredient conversion to
 * `scale`, so per_unit vs per_100g is handled in exactly one place in the app.
 */
export function totalMacros(lines: RecipeLine[]): Macros {
  return lines.reduce<Macros>((sum, line) => {
    const m = scale(line.food, line.qty);
    return {
      kcal: sum.kcal + m.kcal,
      protein_g: round1(sum.protein_g + m.protein_g),
      fat_g: round1(sum.fat_g + m.fat_g),
      carb_g: round1(sum.carb_g + m.carb_g),
      fiber_g: round1(sum.fiber_g + m.fiber_g),
      sodium_mg: sum.sodium_mg + m.sodium_mg,
    };
  }, EMPTY);
}

/**
 * Macros for one serving: totals / servings (S16). This is what gets published
 * as the generated food, so it is what every future log of a portion is built
 * from.
 */
export function perServingMacros(lines: RecipeLine[], servings: number): Macros {
  // Guarded by a check constraint in the schema, but this is a pure function
  // and callers include a half-typed form where servings is briefly 0 or NaN.
  if (!(servings > 0)) return EMPTY;

  const total = totalMacros(lines);
  return {
    kcal: Math.round(total.kcal / servings),
    protein_g: round1(total.protein_g / servings),
    fat_g: round1(total.fat_g / servings),
    carb_g: round1(total.carb_g / servings),
    fiber_g: round1(total.fiber_g / servings),
    sodium_mg: Math.round(total.sodium_mg / servings),
  };
}

/**
 * Weight of one ingredient, or null when the food cannot say.
 * per_100g foods are already stored in grams; per_unit foods need
 * `grams_per_unit`, which is genuinely unknown for something like "1 scoop" of
 * a food nobody has weighed.
 */
export function ingredientGrams(food: Food, qty: number): number | null {
  // Millilitres are summed as if they were grams. Every liquid in the catalog
  // is water-based (milk, juice, stock) and sits within a few percent of 1
  // g/ml, which is far inside the band S21 flags on -- and the alternative is a
  // density column nobody can fill in. Revisit only if oils or syrups start
  // appearing as recipe ingredients by volume.
  if (food.basis === "per_100g") return qty;
  if (food.grams_per_unit == null) return null;
  return qty * food.grams_per_unit;
}

/**
 * Sum of the ingredient weights, or the names of the foods that blocked it.
 * Unknown is not zero: counting an unweighable ingredient as 0 g would inflate
 * the yield ratio and flag a perfectly good cook (S21).
 */
export function rawInputWeight(lines: RecipeLine[]): RawWeight {
  const missing: string[] = [];
  let grams = 0;

  for (const line of lines) {
    const g = ingredientGrams(line.food, line.qty);
    if (g == null) missing.push(line.food.name);
    else grams += g;
  }

  if (missing.length > 0) return { known: false, missing };
  return { known: true, grams: round1(grams) };
}

/**
 * A yield modestly under 100% is just water leaving a simmer and is shown
 * without comment. Only a result outside this band suggests a fat-fingered
 * quantity or a forgotten ingredient.
 */
export const YIELD_MIN = 0.4;
export const YIELD_MAX = 1.1;

export type YieldCheck = {
  /** cooked / raw. 0.85 means the dish lost 15% of its weight. */
  ratio: number;
  /**
   * "low": far less came out than went in -- more likely an over-stated
   * ingredient quantity than that much evaporation. "high": more came out than
   * went in, which needs an ingredient that was forgotten or under-stated.
   */
  verdict: "plausible" | "low" | "high";
};

/**
 * Advisory only (S21). Nothing here ever blocks a save -- an unusual yield is a
 * prompt to look at the numbers, and real cooks do sit outside the band
 * sometimes (a stew reduced hard, a roast that rendered).
 *
 * Returns null when the ratio is meaningless rather than merely odd.
 */
export function yieldCheck(cookedWeightG: number, rawGrams: number): YieldCheck | null {
  if (!(rawGrams > 0) || !(cookedWeightG > 0)) return null;
  const ratio = cookedWeightG / rawGrams;
  if (ratio < YIELD_MIN) return { ratio, verdict: "low" };
  if (ratio > YIELD_MAX) return { ratio, verdict: "high" };
  return { ratio, verdict: "plausible" };
}

/**
 * Convenience over `rawInputWeight` + `yieldCheck`: null whenever the check
 * cannot run at all (no cooked weight recorded, or an ingredient of unknown
 * weight). Call `rawInputWeight` directly to tell those two cases apart and
 * name the offending foods.
 */
export function checkRecipeYield(
  lines: RecipeLine[],
  cookedWeightG: number | null,
): YieldCheck | null {
  if (cookedWeightG == null) return null;
  const raw = rawInputWeight(lines);
  if (!raw.known) return null;
  return yieldCheck(cookedWeightG, raw.grams);
}

/**
 * The generated food's id is derived from the recipe id rather than held on a
 * column: the link is then total by construction, and re-saving a recipe
 * upserts the same row instead of littering the catalog with orphans (S19).
 */
export function recipeFoodId(recipeId: string): string {
  return `recipe_${recipeId}`;
}

/**
 * The `foods` row a recipe publishes (S16). It is an ordinary catalog row, so
 * logging a portion reuses the existing quantity/meal confirm sheet with no new
 * logging code -- the recipe stays the source of truth, this is its output.
 */
export function generatedFood(
  recipeId: string,
  details: RecipeDetails,
  lines: RecipeLine[],
): Food {
  const per = perServingMacros(lines, details.servings);
  return {
    id: recipeFoodId(recipeId),
    name: details.name,
    aliases: [],
    // One serving is the unit, which is what makes a portion one entry.
    basis: "per_unit",
    unit: "serving",
    // A cooked weight is weighed on a scale, so a serving of a dish is grams.
    weight_unit: "g",
    // With a cooked weight, a serving has a real gram weight and an odd-sized
    // portion becomes loggable by grams (S17). Without one the weight is
    // genuinely unknown -- null, not zero.
    grams_per_unit:
      details.cooked_weight_g != null && details.servings > 0
        ? round1(details.cooked_weight_g / details.servings)
        : null,
    kcal: per.kcal,
    protein_g: per.protein_g,
    fat_g: per.fat_g,
    carb_g: per.carb_g,
    fiber_g: per.fiber_g,
    sodium_mg: per.sodium_mg,
    // `verified` means "transcribed from a label" (0001_init.sql). A computed
    // dish never is, however trustworthy its ingredients.
    verified: false,
    // Its numbers are as good as its ingredients', which carry their own
    // sources; the dish itself was computed, and says so (S6).
    source: "recipe",
    // Homemade dishes have no barcode.
    barcode: null,
  };
}
