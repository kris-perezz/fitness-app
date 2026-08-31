import type { Food } from "@/lib/food";

/**
 * Nutrition label extraction (S4, S5).
 *
 * The whole provider lives behind `extractLabel`. Nothing else in the app knows
 * which model read the photo, so switching to Gemini -- open decision 4's
 * fallback -- is a change to this file and nowhere else.
 *
 * Server-side only, and structurally so: the key is read from a non-public
 * environment variable, which is `undefined` in the browser bundle. It must
 * never gain a NEXT_PUBLIC_ prefix.
 *
 * Shaped like lib/off.ts on purpose: it never throws, and every failure comes
 * back as a value the UI can render.
 */

const API = "https://api.openai.com/v1/responses";

/**
 * Chosen over gpt-4o-mini deliberately. At a few labels a week the price
 * difference is about a cent a month, while the failure mode -- reading "30 g"
 * as "3.0 g" and writing it into a typed column you then log against for
 * months -- is expensive and silent. Luna is current, vision-capable and
 * supports strict structured outputs, which is the guarantee open decision 4
 * picked OpenAI for.
 */
const MODEL = "gpt-5.6-luna";

/** Vision calls on a dense table are slow; a phone on mobile data slower still. */
const TIMEOUT_MS = 45_000;

/** What the model is asked to return, before it is mapped onto a Food. */
type Extracted = {
  name: string | null;
  serving_label: string | null;
  serving_amount: number | null;
  serving_unit: string | null;
  basis: string | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
};

/** A draft food, not a saved one: every field is editable before it is written. */
export type LabelDraft = Omit<Food, "id" | "aliases" | "barcode">;

export type LabelResult =
  | { status: "found"; draft: LabelDraft; warning: string | null }
  // The photo reached the model and the model could not read a label off it.
  // Distinct from an error: retaking the photo is the useful next step.
  | { status: "unreadable"; message: string }
  | { status: "error"; message: string };

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"] },
    serving_label: { type: ["string", "null"] },
    serving_amount: { type: ["number", "null"] },
    serving_unit: { type: ["string", "null"] },
    basis: { type: ["string", "null"] },
    kcal: { type: ["number", "null"] },
    protein_g: { type: ["number", "null"] },
    fat_g: { type: ["number", "null"] },
    carb_g: { type: ["number", "null"] },
    fiber_g: { type: ["number", "null"] },
    sodium_mg: { type: ["number", "null"] },
  },
  required: [
    "name",
    "serving_label",
    "serving_amount",
    "serving_unit",
    "basis",
    "kcal",
    "protein_g",
    "fat_g",
    "carb_g",
    "fiber_g",
    "sodium_mg",
  ],
  additionalProperties: false,
} as const;

const PROMPT = `You are reading a nutrition facts panel from a photograph of food packaging.

Return only what is printed. Never estimate, infer from the product name, or fill a
field from general knowledge. A number you cannot actually read is null.

Canadian packaging is bilingual, so the same panel carries English and French
labels side by side or stacked: "Nutrition Facts / Valeur nutritive",
"Supplemented Food Facts / Info-aliment supplementé", Calories, "Fat / Lipides",
"Carbohydrate / Glucides", "Fibre / Fibres", "Protein / Protéines",
"Sodium / Sodium". Both languages describe ONE set of numbers -- read each value
once, not twice.

Ignore the "% Daily Value / % valeur quotidienne" column entirely. Those are
percentages, not amounts, and they sit immediately beside the amounts you do want.

basis: "per_serving" if the panel is headed by a serving ("Per 1 shake (325 mL)",
"Pour 1 frappé", "Per 3 pieces"). "per_100" if it is headed per 100 g or 100 mL.
If both are printed, prefer per_serving and read that column.

serving_amount and serving_unit: the metric amount of one serving -- 325 and "ml"
for "Per 1 shake (325 mL)", 50 and "g" for "1 bar (50 g)". Use "ml" only where the
package states a volume; otherwise "g". Null if no metric amount is printed.

serving_label: how the package names one serving in English -- "1 shake", "1 bar",
"3 pieces". Null if it names none.

Amounts are in grams except sodium, which is in milligrams. Convert if the panel
prints sodium in grams. Fat means total fat, not saturated or trans.

name: the product's brand and name, read from ANY text visible in the photo --
the front of the package, a side panel, or the manufacturer and trademark lines
that usually sit just below the nutrition panel ("PREMIER PROTEIN IS A REGISTERED
TRADEMARK OF..."). A photo framed on the panel alone still normally shows one of
these. Give the brand and the flavour together when both are readable. Null only
when no product name appears anywhere in the photo -- never invent one from the
ingredients, and never describe the package.`;

function envKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key === undefined || key === "" ? null : key;
}

/** Positive, finite, and not an obvious misread. Null covers everything else. */
function clean(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > max) return null;
  return value;
}

/**
 * A label's calories should be roughly what its macros spend: 4/4/9 per gram.
 * A misplaced decimal point is the failure that matters here -- "3.0 g" read as
 * "30 g" survives every type check and quietly triples a food's protein -- and
 * it shows up as a gap between the two. Reported, never enforced: rounding,
 * sugar alcohols and fibre all move the number legitimately, so this is a
 * prompt to look rather than a rejection.
 */
function macroWarning(draft: LabelDraft): string | null {
  const spent = draft.protein_g * 4 + draft.carb_g * 4 + draft.fat_g * 9;
  if (draft.kcal <= 0 || spent <= 0) return null;
  const drift = Math.abs(spent - draft.kcal) / draft.kcal;
  if (drift <= 0.25) return null;
  return `The macros add up to ${Math.round(spent)} calories but the label says ${Math.round(
    draft.kcal,
  )}. Check each number before saving.`;
}

/**
 * Map the panel onto the app's convention: macros per 100 units, with
 * `grams_per_unit` carrying one serving.
 *
 * A per-serving panel is divided down rather than stored as-is, so that one
 * food can be logged by serving or by weight (S5) -- and divided at full
 * precision, since multiplying a rounded per-100 figure back up to a serving is
 * exactly the bug that made a 160 calorie shake read 159.
 */
function toDraft(x: Extracted): LabelDraft | null {
  const kcal = clean(x.kcal, 10_000);
  if (kcal === null) return null;

  const unit = x.serving_unit?.toLowerCase() === "ml" ? "ml" : "g";
  const amount = clean(x.serving_amount, 5_000);
  const perServing = x.basis !== "per_100";

  // Per-serving numbers with no serving size cannot be put on a per-100 basis,
  // so the food becomes one countable serving instead -- honest about the fact
  // that its weight is unknown, exactly as grams_per_unit being null says.
  const countable = perServing && (amount === null || amount === 0);
  const factor = countable || !perServing ? 1 : 100 / amount!;

  const at = (v: number | null) => (clean(v, 100_000) ?? 0) * factor;

  return {
    // Empty rather than a stand-in like "Scanned label": a placeholder in a
    // name field is indistinguishable from something that was actually read,
    // and the save button already refuses to submit a blank name.
    name: x.name?.trim() || "",
    basis: countable ? "per_unit" : "per_100g",
    unit: countable ? x.serving_label?.trim() || "serving" : unit,
    grams_per_unit: countable ? null : amount,
    kcal: kcal * factor,
    protein_g: at(x.protein_g),
    fat_g: at(x.fat_g),
    carb_g: at(x.carb_g),
    fiber_g: at(x.fiber_g),
    sodium_mg: x.sodium_mg === null ? null : at(x.sodium_mg),
    // Confirmed off an actual label, which is the whole point of S4 -- and what
    // puts it above an Open Food Facts row in the source hierarchy.
    verified: true,
  };
}

/**
 * `image` is a data URL. It is downscaled on the client first: a raw phone
 * photo is several megabytes and would not survive the server action body limit.
 */
export async function extractLabel(image: string): Promise<LabelResult> {
  const key = envKey();
  if (key === null) {
    return { status: "error", message: "Label reading is not configured on this server." };
  }
  if (!image.startsWith("data:image/")) {
    return { status: "error", message: "That does not look like a photo." };
  }

  let response: Response;
  try {
    response = await fetch(API, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: PROMPT },
              // "high" rather than the default: a nutrition panel is small, dense
              // text, often photographed at an angle around a curved package.
              { type: "input_image", image_url: image, detail: "high" },
            ],
          },
        ],
        text: {
          format: { type: "json_schema", name: "nutrition_label", strict: true, schema: SCHEMA },
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut ? "Reading the label took too long." : "Could not reach the label reader.",
    };
  }

  if (!response.ok) {
    // The body can carry a key or quota problem, which is for the server log
    // rather than the phone screen.
    console.error("label extraction failed", response.status, await response.text());
    return { status: "error", message: "The label reader is unavailable right now." };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "The label reader sent an unreadable response." };
  }

  const parsed = readOutput(body);
  if (parsed.kind === "refusal") {
    return { status: "unreadable", message: "That photo could not be read as a nutrition label." };
  }
  if (parsed.kind === "none") {
    return { status: "error", message: "The label reader sent nothing back." };
  }

  const draft = toDraft(parsed.value);
  if (draft === null) {
    return {
      status: "unreadable",
      message: "No calories could be read. Try again with the panel filling the frame.",
    };
  }

  return { status: "found", draft, warning: macroWarning(draft) };
}

type Output =
  | { kind: "value"; value: Extracted }
  // Strict mode guarantees the shape of a normal answer but a safety refusal is
  // returned as its own content type instead, so it has to be looked for.
  | { kind: "refusal" }
  | { kind: "none" };

function readOutput(body: unknown): Output {
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return { kind: "none" };

  for (const message of output) {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (p.type === "refusal") return { kind: "refusal" };
      if (p.type === "output_text" && typeof p.text === "string") {
        try {
          return { kind: "value", value: JSON.parse(p.text) as Extracted };
        } catch {
          return { kind: "none" };
        }
      }
    }
  }
  return { kind: "none" };
}
