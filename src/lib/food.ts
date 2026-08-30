export type Food = {
  id: string;
  name: string;
  aliases: string[];
  basis: "per_unit" | "per_100g";
  unit: string;
  grams_per_unit: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number | null;
  verified: boolean;
  /** Set for scanned packaged goods; null for whole foods and recipe outputs. */
  barcode?: string | null;
};

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

export function qtyLabel(food: Food): string {
  return food.basis === "per_100g" ? "grams" : food.unit;
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
