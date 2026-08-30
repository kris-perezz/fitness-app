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

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
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
    unit: "g",
    grams_per_unit: null,
    kcal: Math.round(kcal),
    protein_g: round(num(n["proteins_100g"]) ?? 0),
    fat_g: round(num(n["fat_100g"]) ?? 0),
    carb_g: round(num(n["carbohydrates_100g"]) ?? 0),
    fiber_g: round(num(n["fiber_100g"]) ?? 0),
    sodium_mg: sodium_g === null ? null : Math.round(sodium_g * 1000),
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
