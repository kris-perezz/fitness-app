import type { Food } from "@/lib/food";

/**
 * Open Food Facts client. Server-side only: the browser must not be the one
 * calling out, so the app can keep its own timeout and User-Agent policy.
 */

const API = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 5000;

/** OFF is barcode-indexed, so the barcode IS the natural key for a scanned food. */
export function offFoodId(barcode: string): string {
  return `off_${barcode}`;
}

export function isBarcode(code: string): boolean {
  return /^\d{6,14}$/.test(code);
}

export type OffResult =
  | { status: "found"; food: Food }
  | { status: "miss" }
  | { status: "error"; message: string };

type Nutriments = Record<string, unknown>;

type OffProduct = {
  product_name?: unknown;
  product_name_en?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  serving_quantity?: unknown;
  serving_quantity_unit?: unknown;
  nutriments?: Nutriments;
};

/** OFF returns numbers as numbers or as strings depending on the contributor. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayName(product: OffProduct, barcode: string): string {
  const name =
    text(product.product_name) || text(product.product_name_en) || text(product.generic_name);
  const brand = text(product.brands).split(",")[0]?.trim() ?? "";
  if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) {
    return `${brand} ${name}`;
  }
  return name || brand || `Barcode ${barcode}`;
}

/**
 * The label's own serving size, which is what makes "one shake" loggable
 * without the user knowing it weighs 325 g.
 *
 * For liquids OFF measures in millilitres, and so does the label: a Canadian
 * drink is declared per mL, and OFF's "per 100g" figures for it are really per
 * 100 mL. The number is therefore correct and only the column name is not --
 * `grams_per_unit` holds whatever the product is measured in, and `unit`
 * records which that is so nothing ever tells the user a 325 mL shake weighs
 * 325 g. Converting to real grams would need a density we do not have and
 * would break the round trip back to the label.
 *
 * Null rather than a guess when the field is missing or absurd -- an unknown
 * serving size is unknown, not 100 g.
 */
function servingGrams(product: OffProduct): number | null {
  const raw = num(product.serving_quantity);
  if (raw === null || raw <= 0 || raw > 5000) return null;
  return Math.round(raw);
}

/**
 * OFF publishes per-100g nutriments, which maps straight onto our per_100g
 * basis. Sodium is the one unit mismatch: they give grams, we store mg.
 */
function toFood(product: OffProduct, barcode: string): Food | null {
  const n: Nutriments = product.nutriments ?? {};
  const kcal = num(n["energy-kcal_100g"]);
  // Without calories there is nothing worth logging, and a zero-calorie food
  // invented from a blank record would be worse than no result at all.
  if (kcal === null) return null;

  const sodium_g = num(n["sodium_100g"]);

  return {
    id: offFoodId(barcode),
    name: displayName(product, barcode),
    aliases: [],
    basis: "per_100g",
    // "ml" for drinks, "g" for everything else -- see servingGrams above.
    unit: text(product.serving_quantity_unit).toLowerCase() === "ml" ? "ml" : "g",
    grams_per_unit: servingGrams(product),
    // Stored at OFF's full precision, deliberately unrounded. These are
    // per-100g figures that OFF derived by DIVIDING the label's per-serving
    // numbers, so logging a serving multiplies them straight back up: rounding
    // 49.184 to 49 here and then scaling by 3.25 loses most of a calorie and
    // reports 159 for a shake whose label says 160. `scale()` rounds the
    // result, which is the only place rounding belongs.
    kcal,
    protein_g: num(n["proteins_100g"]) ?? 0,
    fat_g: num(n["fat_100g"]) ?? 0,
    carb_g: num(n["carbohydrates_100g"]) ?? 0,
    fiber_g: num(n["fiber_100g"]) ?? 0,
    sodium_mg: sodium_g === null ? null : sodium_g * 1000,
    verified: false,
    barcode,
  };
}

/** Never throws: every failure mode comes back as a value the UI can render. */
export async function fetchOffProduct(barcode: string): Promise<OffResult> {
  let response: Response;
  try {
    response = await fetch(`${API}/${encodeURIComponent(barcode)}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        // OFF asks anonymous clients to identify themselves.
        "User-Agent": "fitness-app/0.1 (barcode lookup)",
      },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut
        ? "Open Food Facts took too long to answer."
        : "Could not reach Open Food Facts.",
    };
  }

  // 404 is their "no such product", which is a miss rather than a failure.
  if (response.status === 404) return { status: "miss" };
  if (!response.ok) {
    return { status: "error", message: `Open Food Facts returned ${response.status}.` };
  }

  let body: { status?: unknown; product?: OffProduct } | null;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "Open Food Facts sent an unreadable response." };
  }

  if (!body || num(body.status) !== 1 || !body.product) return { status: "miss" };

  const food = toFood(body.product, barcode);
  // The product exists but carries no usable nutrition -- still a miss, so the
  // UI drops into manual entry instead of showing an error it cannot act on.
  return food ? { status: "found", food } : { status: "miss" };
}
