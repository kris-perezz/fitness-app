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

/** Prose in, six numbers out. Faster than a label read, and no image to upload. */
const TIMEOUT_MS = 20_000;

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
 */
const PROMPT = `You estimate the nutrition of a food or meal from a written description.

Return macros for THE WHOLE PORTION DESCRIBED, not per 100 g and not per serving.
If the description says "3 bowls", estimate all three. If it says "240g cooked",
estimate 240g. If it gives no amount, assume one ordinary single portion and say
so in the assumptions.

Set too_vague to true, and leave every number null, when the description names no
food at all or is too unspecific to estimate within roughly 30% -- "chicken",
"snack", "lunch". Do not guess in those cases. A description that names a food
and any rough amount is NOT too vague.

Write assumptions as one short sentence naming the specific things you assumed:
size, cooking method, milk, oil, sauce, whether skin or bones were eaten. Say the
things that would change the answer most if wrong. Do not restate the description
back. Do not apologise or hedge in general terms.

Estimate conservatively upward where a dish is typically prepared with more fat
than a home cook would use -- restaurant portions, deep-fried items, anything
finished with butter or oil in a pan you did not control.

Numbers are for the whole portion, in the units named: kcal, grams for protein,
fat, carbohydrate and fibre, milligrams for sodium.`;

type Estimated = {
  too_vague: boolean;
  assumptions: string | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
};

/** The six macros the custom-entry form holds, plus what was assumed to get them. */
export type Estimate = {
  assumptions: string;
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

const SCHEMA = {
  type: "object",
  properties: {
    too_vague: { type: "boolean" },
    assumptions: { type: ["string", "null"] },
    kcal: { type: ["number", "null"] },
    protein_g: { type: ["number", "null"] },
    fat_g: { type: ["number", "null"] },
    carb_g: { type: ["number", "null"] },
    fiber_g: { type: ["number", "null"] },
    sodium_mg: { type: ["number", "null"] },
  },
  required: [
    "too_vague",
    "assumptions",
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

/** Case and whitespace are not part of what was asked. */
function cacheKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Non-negative and finite, or the field did not really arrive. */
function macro(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
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
export async function estimateFromDescription(description: string): Promise<DescribeResult> {
  const text = description.trim();
  if (text.length < 3) {
    return { status: "vague", message: "Say what you ate and roughly how much." };
  }

  const key = cacheKey(text);
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
          { role: "user", content: text },
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

  const kcal = macro(parsed.kcal);
  // Calories are the one field the form will not save without, so an estimate
  // without them is not a partial answer -- it is a failed one, and dressing it
  // up as a filled-in form would be worse than saying so.
  if (kcal === null) {
    return { status: "vague", message: "Could not put a number on that. Try describing it more fully." };
  }

  const estimate: Estimate = {
    assumptions: typeof parsed.assumptions === "string" ? parsed.assumptions.trim() : "",
    kcal,
    // Zero where the model returned nothing, matching what the form does with a
    // blank box. A macro is never absent-but-unknown here the way a micro is:
    // the six fields are always written, and `num("")` is already 0 on save.
    protein_g: macro(parsed.protein_g) ?? 0,
    fat_g: macro(parsed.fat_g) ?? 0,
    carb_g: macro(parsed.carb_g) ?? 0,
    fiber_g: macro(parsed.fiber_g) ?? 0,
    sodium_mg: macro(parsed.sodium_mg) ?? 0,
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
