import type { Food } from "@/lib/food";

/**
 * Canadian Nutrient File client (S91). Health Canada's own composition
 * database: 5,690 foods, 152 nutrients, free and bilingual.
 *
 * Server-side only, same rule as `lib/off.ts`: the browser must not be the one
 * calling out, so the app keeps its own timeout policy -- and here there is a
 * second reason, since the catalog is a 471 KB response no phone should be
 * downloading.
 *
 * THIS IS THE GENERIC HALF OF THE FOOD PROBLEM. Open Food Facts is barcode
 * indexed, so it is built for packets; a chicken breast has no barcode to scan
 * and appears in OFF barely or wrongly. CNF is the opposite shape: no barcodes
 * at all, and lab values for the plain foods nobody scans.
 */

const API = "https://food-nutrition.canada.ca/api/canadian-nutrient-file";
const TIMEOUT_MS = 8000;

/**
 * A day. The catalog changes on Health Canada's schedule, which is measured in
 * years, so anything shorter is spending a 471 KB round trip to learn nothing.
 *
 * Cached in Next's data cache rather than in a table on purpose: a table would
 * need a migration, a staleness story and a job to refresh it, to hold a copy
 * of something that is already free to fetch and never edited here.
 */
const CATALOG_TTL_S = 86_400;

/** The food code IS the natural key, the way a barcode is for OFF. */
export function cnfFoodId(code: number): string {
  return `cnf_${code}`;
}

export type CnfHit = {
  code: number;
  /** CNF's own wording, shown in full. The last clause is often the whole difference. */
  description: string;
};

export type CnfSearchResult =
  | { status: "ok"; hits: CnfHit[] }
  | { status: "error"; message: string };

export type CnfFoodResult =
  /**
   * `micros` rides alongside the Food rather than inside it: the `foods` table
   * has had a `micros` jsonb since 0001, but the `Food` TYPE does not carry one
   * until S36 plumbs it through every write path. Returning it separately lets
   * the insert store what CNF gave us without this story quietly doing S36's
   * job -- and without throwing away values we would have to re-fetch.
   */
  | { status: "found"; food: Food; micros: Record<string, number> }
  | { status: "miss" }
  | { status: "error"; message: string };

type CatalogRow = { food_code?: unknown; food_description?: unknown };
type NutrientRow = { nutrient_name_id?: unknown; nutrient_value?: unknown };

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function get(path: string, revalidate: number): Promise<unknown> {
  const response = await fetch(`${API}/${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
    next: { revalidate },
  });
  if (!response.ok) throw new Error(`CNF returned ${response.status}`);
  return response.json();
}

/**
 * Every food name CNF has.
 *
 * `/food/` TAKES NO QUERY PARAMETER -- there is no search endpoint, so a search
 * is this whole list filtered locally. Measured 2026-09-01: 471 KB, 225 ms to
 * first byte, ~440 ms total. Fine once a day; absurd once a keystroke, which is
 * the entire reason for the cache above.
 */
async function catalog(): Promise<CatalogRow[]> {
  const body = await get("food/?lang=en&type=json", CATALOG_TTL_S);
  return Array.isArray(body) ? (body as CatalogRow[]) : [];
}

/**
 * Descriptions that are a prepared dish rather than the food itself.
 *
 * Someone typing "chicken breast" means the chicken, not a fast-food entree or
 * a slice of deli meat, and CNF lists all three with equal billing. These are
 * demoted rather than hidden: "Deli-meat, chicken breast, oven-roasted" is a
 * real thing people eat, it is just never what the plain query meant.
 */
const DEMOTED = [
  "fast foods",
  "deli-meat",
  "restaurant",
  "babyfood",
  "baby food",
  "formulated",
  "supplement",
  // Added after a test caught them: "Chicken breast with broccoli and cheese
  // stuffing, frozen" and "...batter dipped, fried" both outranked the plain
  // chicken breast. A description that says what was DONE to the food, in
  // words the food itself would never carry, is a product and not an
  // ingredient.
  "stuffing",
  "stuffed",
  "breaded",
  "batter",
  " with ",
  "frozen",
];

/**
 * The tail clause CNF uses for a plain preparation.
 *
 * This is the positive signal that makes the ranking work, and it exists
 * because the obvious negative one was backwards -- see rankCnf.
 */
const PREPARATIONS = new Set([
  "raw",
  "cooked",
  "roasted",
  "grilled",
  "broiled",
  "boiled",
  "braised",
  "stewed",
  "simmered",
  "steamed",
  "baked",
  "fried",
  "dried",
  "drained",
]);

/**
 * Rank the catalog against a query.
 *
 * THE RANKING IS THE STORY (S91). 24 rows match "chicken breast" and they are
 * genuinely different foods -- raw against grilled is roughly a 30% swing per
 * 100 g -- so a list in CNF's own order is a coin toss with a nutrition label
 * on it. Three signals, in order of how much they matter:
 *
 *   1. Every word typed must appear. Not fuzzy: a wrong food confidently
 *      returned is worse than no food.
 *   2. A plain preparation as the last clause RISES. "…, meat, raw" and
 *      "…, meat, grilled" are the ingredient; everything else is a product.
 *   3. Prepared dishes sink (see DEMOTED).
 *
 * The first version of this scored on COMMA COUNT, on the theory that each
 * clause is a step away from the plain food. That is exactly backwards for CNF
 * and a test caught it: the canonical row IS the deeply qualified one, because
 * the qualifiers are CNF's taxonomy. "Chicken, broiler, breast, skinless,
 * boneless, meat, raw" has six commas and is the answer; "Chicken breast with
 * broccoli and cheese stuffing, frozen" has one and is not. The penalty is
 * gone rather than reduced -- it was measuring the wrong thing, not measuring
 * it too hard.
 *
 * Deliberately NOT collapsing raw and cooked into one row. A 30% error the user
 * could have prevented is worse than a question they had to answer.
 */
export function rankCnf(rows: CatalogRow[], query: string, limit = 25): CnfHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored: { hit: CnfHit; score: number }[] = [];

  for (const row of rows) {
    const code = num(row.food_code);
    const description = typeof row.food_description === "string" ? row.food_description : "";
    if (code === null || description === "") continue;

    const lower = description.toLowerCase();
    if (!words.every((w) => lower.includes(w))) continue;

    let score = 0;
    // The plain food usually leads with the word you typed.
    if (lower.startsWith(words[0])) score += 40;
    // Whole words over substrings: "rice" should not rank "liquorice" highly.
    for (const w of words) {
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) score += 10;
    }
    // The positive signal that does the real work: CNF names the plain food by
    // ending on how it was cooked.
    const last = lower.split(",").pop()?.trim() ?? "";
    if (PREPARATIONS.has(last)) score += 25;
    if (DEMOTED.some((d) => lower.includes(d))) score -= 60;
    // A mild preference for the shorter of two otherwise equal rows. Mild
    // because length is a weak signal here and was a misleading one as a
    // comma count.
    score -= description.length / 60;

    scored.push({ hit: { code, description }, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.hit.description.localeCompare(b.hit.description))
    .slice(0, limit)
    .map((s) => s.hit);
}

/** Never throws: every failure comes back as a value the UI can render. */
export async function searchCnf(query: string): Promise<CnfSearchResult> {
  if (query.trim().length < 2) return { status: "ok", hits: [] };
  try {
    return { status: "ok", hits: rankCnf(await catalog(), query.trim()) };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "Health Canada took too long to answer."
        : "Could not reach the Canadian Nutrient File.",
    };
  }
}

/**
 * CNF's nutrient numbering, which is the USDA lineage and stable across
 * releases. Verified against food 841 on 2026-09-01.
 *
 * Only the ones this app stores. CNF returns 136 rows for a chicken breast and
 * the other 120 are fatty-acid fractions and amino acids that nothing here
 * renders.
 */
const KCAL = 208;
const PROTEIN = 203;
const FAT = 204;
const CARB = 205;
const FIBRE = 291;
const SODIUM = 307;

/**
 * The micronutrients, keyed by the vocabulary 0002 established.
 *
 * S36 says do not invent a second vocabulary and S88 repeats it, so this maps
 * CNF's 152 nutrients DOWN onto the existing keys rather than the other way
 * round. Written to the `micros` column at materialisation time even though the
 * `Food` type does not carry micros yet (that is S36's job) -- the column has
 * existed since 0001, and throwing the values away here would mean re-fetching
 * all of it later.
 *
 * Vitamin D is taken as 339 (µg) and not 324 (IU): the column is `vit_d_ug`.
 */
const MICROS: Record<number, string> = {
  601: "cholesterol_mg",
  306: "potassium_mg",
  301: "calcium_mg",
  303: "iron_mg",
  309: "zinc_mg",
  304: "magnesium_mg",
  305: "phosphorus_mg",
  317: "selenium_ug",
  339: "vit_d_ug",
  401: "vit_c_mg",
  418: "vit_b12_ug",
};

/**
 * Turn a CNF food code into a Food, per 100 g.
 *
 * CNF publishes everything per 100 g, which maps straight onto the `per_100g`
 * basis with no conversion and no unit trap of the kind OFF's millilitres are.
 * Sodium is already in mg, unlike OFF's grams.
 *
 * `grams_per_unit` stays null. CNF does publish household measures on
 * `/servingsize/`, and pulling them is an open question in S91 rather than an
 * oversight -- a null gram weight is honestly unknown, where a guessed one is
 * a number nobody measured.
 */
export async function fetchCnfFood(code: number, description: string): Promise<CnfFoodResult> {
  let rows: NutrientRow[];
  try {
    const body = await get(
      `nutrientamount/?lang=en&type=json&id=${encodeURIComponent(String(code))}`,
      CATALOG_TTL_S,
    );
    rows = Array.isArray(body) ? (body as NutrientRow[]) : [];
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "Health Canada took too long to answer."
        : "Could not reach the Canadian Nutrient File.",
    };
  }

  const by = new Map<number, number>();
  for (const row of rows) {
    const id = num(row.nutrient_name_id);
    const value = num(row.nutrient_value);
    // ABSENT IS ABSENT: a nutrient CNF has no row for stays out of the map, and
    // out of the jsonb. "No data" and "contains none of it" are different
    // claims and only one of them is honest (S36).
    if (id !== null && value !== null) by.set(id, value);
  }

  const kcal = by.get(KCAL);
  // Without calories there is nothing worth logging, and a zero-calorie food
  // invented from a sparse record would be worse than no result at all.
  if (kcal === undefined) return { status: "miss" };

  const micros: Record<string, number> = {};
  for (const [id, key] of Object.entries(MICROS)) {
    const value = by.get(Number(id));
    if (value !== undefined) micros[key] = value;
  }

  return {
    status: "found",
    micros,
    food: {
      id: cnfFoodId(code),
      name: cnfName(description),
      // CNF's own wording, kept so the row stays findable by what it came from
      // and traceable back to it. Nobody searches "broiler"; it should still
      // work (S90).
      aliases: [description.toLowerCase()],
      basis: "per_100g",
      unit: "g",
      weight_unit: "g",
      grams_per_unit: null,
      // Unrounded, same rule as OFF: these are per-100 g figures that get
      // scaled back up, and `scale()` is the only place rounding belongs.
      kcal,
      protein_g: by.get(PROTEIN) ?? 0,
      fat_g: by.get(FAT) ?? 0,
      carb_g: by.get(CARB) ?? 0,
      fiber_g: by.get(FIBRE) ?? 0,
      sodium_mg: by.get(SODIUM) ?? null,
      verified: false,
      source: "cnf",
      barcode: null,
    },
  };
}

/**
 * CNF's description into something a person would recognise.
 *
 * ONE transformation only: drop the clauses that are CNF's taxonomy rather than
 * the food, and rejoin. `Chicken, broiler, breast, skinless, boneless, meat,
 * grilled` becomes `Chicken, breast, grilled`.
 *
 * An earlier version joined the head and the noun into "Chicken breast,
 * grilled", which reads better for anatomy and produces "Rice white, cooked"
 * for everything else. Prettier on the cases I happened to test and wrong on
 * the rest, so it is gone. Reading slightly worse is the cheaper mistake.
 *
 * The preparation is NEVER dropped -- cooking state is a ~30% difference and
 * losing it is a lie by omission (S88). Where no taxonomy clause is found the
 * description survives untouched, which is the conservative default and the
 * common case.
 */
export function cnfName(description: string): string {
  const parts = description.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return description;

  // The head is never dropped even if it looks like taxonomy: it is the food.
  const kept = [parts[0], ...parts.slice(1).filter((p) => !TAXONOMY.has(p.toLowerCase()))];
  return kept.length === parts.length ? description : kept.join(", ");
}

/**
 * CNF's classification words, which name a category rather than a food.
 *
 * Whole clauses only, never substrings: "whole" as its own clause in "Egg,
 * whole, raw" is taxonomy, where "whole wheat" inside one is the food.
 */
const TAXONOMY = new Set([
  "broiler",
  "broilers or fryers",
  "meat",
  "meat only",
  "meat and skin",
  "skinless",
  "boneless",
  "whole",
  "all classes",
  "composite",
  "commercial",
]);
