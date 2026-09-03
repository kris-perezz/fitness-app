/**
 * Macro estimation from a written description (S100).
 *
 * A SIBLING TO lib/label.ts, NOT A BRANCH INSIDE IT. Both call the same
 * provider behind one function and neither throws, and there the resemblance
 * stops: that one reads numbers PRINTED on a panel and this one infers numbers
 * that were never written down anywhere. Different prompt, different schema,
 * different failure modes, and folding them together would mean one prompt
 * hedging between "return only what is printed" and "estimate what is likely".
 *
 * WHAT THIS IS FOR. The identification problem is already solved -- people
 * describe what they ate perfectly well, at length, in the name field. What
 * they cannot do without a search is source the number. So this is the
 * arithmetic, and nothing else: it fills in fields the user was about to fill
 * in themselves, and every one of them stays editable afterwards.
 *
 * Server-side only, and structurally so: the key is read from a non-public
 * environment variable, `undefined` in the browser bundle. It must never gain a
 * NEXT_PUBLIC_ prefix.
 */

import { createHash } from "node:crypto";
import { rowsFrom, totals, type Component } from "./portion.ts";

// Re-exported so the form can type its rows without importing this file,
// which would put the API key's module -- and node:crypto -- in the bundle.
export type { Component };

const API = "https://api.openai.com/v1/responses";

/**
 * The same model lib/label.ts settled on, for the same reason: on Roboflow's
 * vision evals the 5.6 tiers separate on detection and reasoning, which neither
 * of these features needs, and barely separate on extraction, which is what
 * both do. Keeping the two files on one model is deliberate -- two estimators
 * disagreeing about the same lunch would be a bug nobody could see.
 */
const MODEL = "gpt-5.6-luna";

/**
 * Set explicitly rather than left to the default. The default is not documented
 * consistently across the 5.6 family, and an unchosen value is a silent swing
 * in latency, cost and answer. `low` is what OpenAI's own guidance points at
 * for extraction-shaped work.
 */
const REASONING_EFFORT = "low";

/**
 * Prose alone is fast. A photo on mobile data is not, so this sits between the
 * text-only case and lib/label.ts's 45s -- a meal photo is one pass over a
 * plate, not a dense table read at an angle.
 */
const TIMEOUT_MS = 30_000;

/**
 * THE MOST IMPORTANT LINE IN THIS FILE IS "the whole portion described".
 *
 * A typed entry is written as `qty 1 / unit "serving"` (add-sheet.tsx), so the
 * amount lives inside the sentence and the macros must cover all of it. A model
 * that answers per 100 g instead is wrong by a factor nobody will notice: the
 * numbers look plausible, the form accepts them, and every estimate is off by
 * the portion size for as long as the mistake goes unspotted.
 *
 * The other rules are honesty rules. `too_vague` exists so that "chicken" asks
 * a question instead of inventing a number, and the assumptions line exists
 * because an estimate whose reasoning is invisible cannot be corrected -- the
 * user's own log already does this by hand ("Assumes ~3 large scrambled eggs
 * ... revise if egg count differs"), so this is their convention, not a new one.
 *
 * ITEMISING IS THE SAME HONESTY RULE, TAKEN SERIOUSLY. A measured plate of
 * pulled pork poutine came back at 1450 kcal because the model assumed 640 g of
 * food on a small side plate. It had identified every item correctly; it had
 * simply guessed one mass too high, and it said so -- inside a prose sentence,
 * where the number could be read but not changed. Restating the plate size in
 * the description moved the answer 7%; stating a weight moved it 26%. So the
 * fix is not a better guess, it is putting the guessed masses somewhere the
 * person who saw the plate can overrule the one that is wrong.
 */
const PROMPT = `You estimate the nutrition of a food or meal from a written description, and
from a photograph of it when one is given.

WHEN THERE IS A PHOTO, the two inputs answer different questions and neither
overrides the other wholesale. The photo tells you what is on the plate and how
much of it: the items, their relative sizes, how full the bowl is, how many
pieces. The description tells you what the photo cannot show: the milk in the
drink, the oil in the pan, the sauce under the rice, whether it is the diet
version, a weight from a scale. Where the description states a fact, take it --
a stated weight always beats an eyeballed one. Where it is silent, read the photo.
Where they genuinely conflict, follow the description and say so in assumptions.

Judge portion size from what is next to the food. A standard dinner plate is
about 27 cm, a fork about 19 cm, a can 355 mL. Say in the assumptions what you
scaled against.

ITEMISE THE PLATE BEFORE YOU PUT A NUMBER ON IT. Return one component for each
distinct food you can name -- the fries, the curds, the gravy, the meat -- each
with the grams you are assuming for that item and the macros for that mass
alone. Never return a single component standing for the whole meal, and never
name one "meal" or "plate": the assumed grams are the part most likely to be
wrong, and separating them is what lets a wrong answer be corrected instead of
thrown away. Combine two foods only when they are genuinely inseparable, such
as a sauce already stirred through.

Do not return overall totals. They are computed by adding your components up,
so each component's numbers have to stand on their own.

Your components together must cover THE WHOLE PORTION DESCRIBED, not per 100 g and not per serving.
If the description says "3 bowls", estimate all three. If it says "240g cooked",
estimate 240g. If it gives no amount, assume one ordinary single portion and say
so in the assumptions.

Set too_vague to true, and leave every number null, when there is no photo AND the
description names no food at all or is too unspecific to estimate within roughly
30% -- "chicken", "snack", "lunch". Do not guess in those cases. A description
that names a food and any rough amount is NOT too vague, and neither is a photo
you can actually see food in.

Set too_vague to true for a photo you cannot identify food in at all, or one
where the quantity is genuinely unbounded -- a buffet spread, a shared table, a
hotpot -- unless the description says what was taken from it.

Write assumptions as one short sentence naming the specific things you assumed
that a weight does not capture: cooking method, milk, oil, sauce, cut of meat,
whether skin or bones were eaten, what you scaled the portion against. Do NOT
list the component masses again -- they are already itemised, and repeating them
here only makes the sentence longer. Do not restate the description back. Do not
apologise or hedge in general terms.

Estimate conservatively upward where a dish is typically prepared with more fat
than a home cook would use -- restaurant portions, deep-fried items, anything
finished with butter or oil in a pan you did not control.

Numbers are for the whole portion, in the units named: kcal, grams for protein,
fat, carbohydrate and fibre, milligrams for sodium.`;

type EstimatedComponent = {
  item: unknown;
  grams: unknown;
  kcal: unknown;
  protein_g: unknown;
  fat_g: unknown;
  carb_g: unknown;
  fiber_g: unknown;
  sodium_mg: unknown;
};

type Estimated = {
  too_vague: boolean;
  components: EstimatedComponent[] | null;
  assumptions: string | null;
};

/**
 * The six macros the custom-entry form holds, plus what was assumed to get them.
 *
 * The six totals are computed here by summing `components`, never read from the
 * model. That is the same rule the rest of the app follows for derived numbers,
 * and it has a second payoff specific to this file: because the totals are a
 * function of the components, the user editing one component's grams re-derives
 * a correct total without another API call.
 */
export type Estimate = {
  assumptions: string;
  components: Component[];
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number;
};

export type DescribeResult =
  | { status: "ok"; estimate: Estimate }
  // Distinct from an error the way `unreadable` is in lib/label.ts: saying more
  // about the food is the useful next step, and retrying the same words is not.
  | { status: "vague"; message: string }
  | { status: "error"; message: string };

const COMPONENT_SCHEMA = {
  type: "object",
  properties: {
    item: { type: "string" },
    grams: { type: ["number", "null"] },
    kcal: { type: ["number", "null"] },
    protein_g: { type: ["number", "null"] },
    fat_g: { type: ["number", "null"] },
    carb_g: { type: ["number", "null"] },
    fiber_g: { type: ["number", "null"] },
    sodium_mg: { type: ["number", "null"] },
  },
  required: [
    "item",
    "grams",
    "kcal",
    "protein_g",
    "fat_g",
    "carb_g",
    "fiber_g",
    "sodium_mg",
  ],
  additionalProperties: false,
} as const;

/**
 * `components` is listed BEFORE `assumptions` on purpose. Structured output is
 * generated in property order, so the model itemises the plate and commits to a
 * mass per item before it writes the sentence explaining itself -- the sentence
 * then describes a decision already made rather than standing in for one.
 *
 * There are no total fields. Totals are a sum, and a sum is arithmetic this
 * codebase does not ask a language model to perform.
 */
const SCHEMA = {
  type: "object",
  properties: {
    too_vague: { type: "boolean" },
    components: { type: "array", items: COMPONENT_SCHEMA },
    assumptions: { type: ["string", "null"] },
  },
  required: ["too_vague", "components", "assumptions"],
  additionalProperties: false,
} as const;

/**
 * Identical descriptions must return identical numbers.
 *
 * S35's load-bearing argument is that a biased-but-stable measure beats an
 * unbiased-but-noisy one, because a systematic logging error cancels out of an
 * adaptive expenditure model while noise does not. A model asked the same
 * question twice does not promise the same answer, so re-tapping the button on
 * an unchanged sentence would produce a second, different truth.
 *
 * IN MEMORY, AND THAT IS ENOUGH. It survives a re-tap and a second look within
 * a session, which is when this actually fires. It does not survive a deploy,
 * and it does not need to: the durable answer to "the same thing again next
 * week" is S99 -- save it as a food once and the numbers are fixed for good by
 * a catalog row, which is a better cache than this could ever be.
 */
const CACHE_LIMIT = 50;
const cache = new Map<string, Estimate>();

/**
 * Case and whitespace are not part of what was asked. The photo is, so it is
 * hashed into the key rather than ignored -- otherwise the first text-only
 * answer would be replayed for every later photo of the same words, which is
 * the exact opposite of what attaching a photo is asking for.
 */
function cacheKey(description: string, image: string | null): string {
  const words = description.trim().toLowerCase().replace(/\s+/g, " ");
  if (image === null) return words;
  const digest = createHash("sha256").update(image).digest("hex").slice(0, 16);
  return `${words}|${digest}`;
}

/** Non-negative and finite, or the field did not really arrive. */
function macro(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * A row survives only if it is named and carries a usable calorie figure.
 *
 * Dropping the rest is safe in a way it would not be if these were totals: a
 * nameless row cannot be shown, and a row with no calories contributes nothing
 * to any of the six sums, so neither one changes an answer by being discarded.
 * Zero is the fallback for the other five macros for the same reason the form
 * treats a blank box as zero -- nobody typed a number there either.
 */
function readComponents(value: unknown): Component[] {
  if (!Array.isArray(value)) return [];
  const rows: Component[] = [];
  for (const raw of value) {
    const c = raw as EstimatedComponent;
    const item = typeof c.item === "string" ? c.item.trim() : "";
    const kcal = macro(c.kcal);
    if (item === "" || kcal === null) continue;
    rows.push({
      item,
      // A mass of zero is not a mass, and scaling by it divides by zero in the
      // UI, so it is stored as "no mass given" rather than as a number.
      grams: macro(c.grams) || null,
      kcal,
      protein_g: macro(c.protein_g) ?? 0,
      fat_g: macro(c.fat_g) ?? 0,
      carb_g: macro(c.carb_g) ?? 0,
      fiber_g: macro(c.fiber_g) ?? 0,
      sodium_mg: macro(c.sodium_mg) ?? 0,
    });
  }
  return rows;
}

/**
 * Same walk as lib/label.ts, and the `type` checks are the load-bearing part.
 * A reasoning model puts a reasoning item in `output` before the message, so a
 * loop that grabs the first thing with a `text` field parses the wrong one.
 */
function readOutput(body: unknown): Estimated | null {
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  for (const message of output) {
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: unknown; text?: unknown };
      // A refusal is not a schema failure; it reaches the caller as one anyway,
      // because there is nothing useful to say about it that "try describing it
      // differently" does not already cover.
      if (p.type === "refusal") return null;
      if (p.type === "output_text" && typeof p.text === "string") {
        try {
          return JSON.parse(p.text) as Estimated;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Never throws: every failure comes back as a value the UI can render. */
export async function estimateFromDescription(
  description: string,
  /** A data URL from lib/image.ts, already downscaled. Optional by design. */
  image?: string | null,
): Promise<DescribeResult> {
  const text = description.trim();
  const photo = image ?? null;

  if (photo !== null && !photo.startsWith("data:image/")) {
    return { status: "error", message: "That does not look like a photo." };
  }
  // A photo carries the whole question on its own, so the floor on the words
  // only applies when the words are all there is.
  if (photo === null && text.length < 3) {
    return { status: "vague", message: "Say what you ate and roughly how much." };
  }

  const key = cacheKey(text, photo);
  const hit = cache.get(key);
  if (hit) return { status: "ok", estimate: hit };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "error", message: "Estimating is not configured on this server." };
  }

  let response: Response;
  try {
    response = await fetch(API, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: REASONING_EFFORT },
        input: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            // Text BEFORE the image. OpenAI's vision guidance is explicit that
            // the model reads content in order and that putting the instruction
            // first measurably improves extraction -- and here the description
            // is the half that says what the photo cannot show.
            content: [
              { type: "input_text", text: text === "" ? "(no description given)" : text },
              // "high" for the same reason lib/label.ts uses it: the detail that
              // decides the answer is small -- how full the bowl is, how many
              // pieces are left, what is under the sauce.
              ...(photo === null
                ? []
                : [{ type: "input_image", image_url: photo, detail: "high" }]),
            ],
          },
        ],
        text: {
          format: { type: "json_schema", name: "food_estimate", strict: true, schema: SCHEMA },
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return {
      status: "error",
      message: timedOut ? "Estimating took too long." : "Could not reach the estimator.",
    };
  }

  if (!response.ok) {
    // A key or quota problem belongs in the server log, not on a phone screen.
    console.error("estimate failed", response.status, await response.text());
    return { status: "error", message: "The estimator is unavailable right now." };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "The estimator sent an unreadable response." };
  }

  const parsed = readOutput(body);
  if (!parsed) return { status: "error", message: "The estimator sent an unreadable response." };

  if (parsed.too_vague) {
    return {
      status: "vague",
      message: "Too vague to estimate. Add a size, a weight, or how it was cooked.",
    };
  }

  const components = readComponents(parsed.components);
  // Summed through lib/portion.ts, which is also what the form re-sums with
  // after a weight is corrected. One implementation, both sides.
  const summed = totals(rowsFrom(components));
  // Calories are the one field the form will not save without, so an estimate
  // without them is not a partial answer -- it is a failed one, and dressing it
  // up as a filled-in form would be worse than saying so. With components that
  // covers one more case than it used to: a list that arrived but adds to
  // nothing is a failure too, however many rows it has.
  if (components.length === 0 || summed.kcal === 0) {
    return { status: "vague", message: "Could not put a number on that. Try describing it more fully." };
  }

  const estimate: Estimate = {
    assumptions: typeof parsed.assumptions === "string" ? parsed.assumptions.trim() : "",
    components,
    ...summed,
  };

  // Oldest out first. The cap is about not growing without bound on a long-lived
  // server, not about hit rate -- 50 descriptions is far more than one session.
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, estimate);

  return { status: "ok", estimate };
}
