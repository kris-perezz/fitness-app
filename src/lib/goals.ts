/**
 * Keeping the calorie goal and the macro goals in agreement.
 *
 * Calories are the anchor: whatever the user last typed is taken as the truth,
 * and the macros are nudged to the nearest whole-gram split that spends exactly
 * that many calories while staying as close as possible to the split they
 * already had. Whole grams are what every tracker stores, so "exactly" is only
 * available on the 4/4/9 grid -- see `balance` for how the remainder is placed.
 */

export const KCAL_PER_G = {
  protein_goal_g: 4,
  carb_goal_g: 4,
  fat_goal_g: 9,
} as const;

export type MacroKey = keyof typeof KCAL_PER_G;
export type MacroGoals = Record<MacroKey, number>;

export const MACRO_KEYS = ["protein_goal_g", "carb_goal_g", "fat_goal_g"] as const;

/** Calories the macro split actually spends. */
export function caloriesOf(macros: MacroGoals): number {
  return MACRO_KEYS.reduce((sum, key) => sum + macros[key] * KCAL_PER_G[key], 0);
}

/** A split is settled when it lands on the calorie goal; a stray gram is not. */
export function isBalanced(calories: number, macros: MacroGoals): boolean {
  return Math.abs(caloriesOf(macros) - Math.round(calories)) < 1;
}

const clampGrams = (g: number) => Math.max(0, Math.round(g));

/** Even three-way fallback when the current split carries no information. */
const DEFAULT_SHARES: MacroGoals = {
  protein_goal_g: 0.3,
  carb_goal_g: 0.4,
  fat_goal_g: 0.3,
};

/** Each macro's slice of the current calories, normalised to sum to 1. */
function sharesOf(macros: MacroGoals): MacroGoals {
  const total = caloriesOf(macros);
  if (total <= 0) return DEFAULT_SHARES;
  return {
    protein_goal_g: (macros.protein_goal_g * 4) / total,
    carb_goal_g: (macros.carb_goal_g * 4) / total,
    fat_goal_g: (macros.fat_goal_g * 9) / total,
  };
}

/**
 * Split `calories` across protein/carbs/fat in the given calorie shares, in
 * whole grams that add back up to `calories` exactly.
 *
 * Protein and carbs both cost 4 kcal/g, so any pair of them lands on a multiple
 * of 4; fat at 9 kcal/g is what can reach the calories in between. So fat is
 * rounded to the nearest gram that leaves a multiple of 4 behind (at most 2 g
 * away from its ideal), and the remainder is divided into protein and carbs by
 * their relative share -- which always divides evenly. The result is exact for
 * every calorie goal, and off by at most 2 kcal only when `fatGrams` is pinned
 * by the caller to a gram that cannot leave a multiple of 4.
 */
function split(calories: number, shares: MacroGoals, fatGrams?: number): MacroGoals {
  const target = Math.max(0, Math.round(calories));

  let fat: number;
  if (fatGrams === undefined) {
    const ideal = Math.round((target * shares.fat_goal_g) / 9);
    // Nearest gram of fat that leaves protein + carbs a whole number of grams.
    const offset = ((target - 9 * ideal) % 4 + 4) % 4;
    fat = ideal + (offset > 2 ? offset - 4 : offset);
  } else {
    fat = fatGrams;
  }
  fat = Math.min(clampGrams(fat), Math.floor(target / 9));

  const gramsLeft = Math.max(0, Math.round((target - 9 * fat) / 4));
  const lean = shares.protein_goal_g + shares.carb_goal_g;
  const protein = lean > 0 ? Math.round((gramsLeft * shares.protein_goal_g) / lean) : gramsLeft;

  return {
    protein_goal_g: protein,
    carb_goal_g: gramsLeft - protein,
    fat_goal_g: fat,
  };
}

/**
 * Re-fit the macros onto `calories`, keeping the split the user already chose.
 * Use after the calorie goal itself changes.
 */
export function balance(calories: number, macros: MacroGoals): MacroGoals {
  return split(calories, sharesOf(macros));
}

/**
 * Re-fit the macros onto `calories` while holding `pinned` at the grams the
 * user just typed; the other two absorb the difference in their current ratio.
 * Use after one macro field changes.
 */
export function balanceAround(
  calories: number,
  macros: MacroGoals,
  pinned: MacroKey,
): MacroGoals {
  const target = Math.max(0, Math.round(calories));
  const held = clampGrams(macros[pinned]);
  const others = MACRO_KEYS.filter((key) => key !== pinned);

  // The pinned macro cannot cost more than the whole goal.
  const heldGrams = Math.min(held, Math.floor(target / KCAL_PER_G[pinned]));
  const rest = target - heldGrams * KCAL_PER_G[pinned];

  const otherCals = others.reduce((sum, key) => sum + macros[key] * KCAL_PER_G[key], 0);
  const shares = {} as MacroGoals;
  for (const key of MACRO_KEYS) {
    if (key === pinned) shares[key] = 0;
    else if (otherCals > 0) shares[key] = (macros[key] * KCAL_PER_G[key]) / otherCals;
    else shares[key] = DEFAULT_SHARES[key] / (1 - DEFAULT_SHARES[pinned]);
  }

  const filled = split(rest, shares, pinned === "fat_goal_g" ? 0 : undefined);
  return { ...filled, [pinned]: heldGrams };
}
