/**
 * The micronutrient vocabulary, declared once (S36).
 *
 * It was already established by the seed set in 0002 and re-typed by hand in
 * `lib/cnf.ts`. A third copy was about to be written in `lib/off.ts`, which is
 * the point at which two copies becomes a shared module -- the failure mode is
 * not a crash but a `vitaminD_ug` sitting quietly beside a `vit_d_ug`, summing
 * to nothing and looking fine.
 *
 * The unit is IN THE KEY, deliberately. `calcium_mg` cannot be read as
 * micrograms by a later reader who did not check, and a value that changes unit
 * would have to change key -- which is a migration somebody has to notice
 * rather than a silent factor of a thousand.
 */

/** Every key the app recognises. Anything else is dropped rather than stored. */
export const MICRO_KEYS = [
  "cholesterol_mg",
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "zinc_mg",
  "magnesium_mg",
  "phosphorus_mg",
  "selenium_ug",
  "vit_a_ug",
  "vit_d_ug",
  "vit_c_mg",
  "vit_b12_ug",
  "vit_b6_mg",
  "thiamine_mg",
  "riboflavin_mg",
  "niacin_mg",
  "pantothenate_mg",
  "folate_ug",
] as const;

export type MicroKey = (typeof MICRO_KEYS)[number];

/**
 * ABSENT IS ABSENT. A nutrient with no value is missing from the object, never
 * zero: "no data" and "contains none of it" are different claims and only one
 * of them is honest. Every reader here has to treat a missing key as unknown.
 */
export type Micros = Partial<Record<MicroKey, number>>;

const KEYS = new Set<string>(MICRO_KEYS);

/** A jsonb column from the database, narrowed to keys and finite numbers. */
export function toMicros(value: unknown): Micros {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Micros = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!KEYS.has(key)) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    // NaN and Infinity are dropped rather than stored: a nutrient the source
    // could not express is one it did not give us.
    if (Number.isFinite(n)) out[key as MicroKey] = n;
  }
  return out;
}

/**
 * Scale a per-100 g micro set by the same factor the macros use.
 *
 * Unrounded, matching the macro rule: these are per-100 figures scaled back up,
 * and rounding at every entry compounds across a day of them.
 */
export function scaleMicros(micros: Micros, factor: number): Micros {
  const out: Micros = {};
  for (const key of MICRO_KEYS) {
    const value = micros[key];
    if (value !== undefined) out[key] = value * factor;
  }
  return out;
}

/** Add two micro sets, keeping absence absent: unknown plus known is known. */
export function addMicros(a: Micros, b: Micros): Micros {
  const out: Micros = { ...a };
  for (const key of MICRO_KEYS) {
    const value = b[key];
    if (value === undefined) continue;
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}
