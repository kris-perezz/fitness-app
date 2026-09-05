/**
 * What a number MEANS, decided in one place (S74).
 *
 * Components ask this module; they never decide for themselves. Without it the
 * tone becomes a boolean threaded through six components and the two modes
 * drift apart within a month -- and the direction of a metric gets re-derived
 * from its goal number, which cannot carry it.
 *
 * Pure functions over plain values. No React, no Supabase, so the interesting
 * part is unit tested and the components stay dumb -- the same instinct as
 * `goals.ts` owning the macro arithmetic.
 */

/**
 * EVERY METRIC HAS A DIRECTION AND IT IS NOT THE SAME DIRECTION (S72).
 *
 * This is the whole reason the module exists. `MacroMeter` used to take a goal
 * number alone and redden anything past it, which painted protein `destructive`
 * at 200 g against a 155 g floor -- at the exact moment the user did the thing
 * they were aiming at. A goal number cannot say which way is good; the metric
 * can, and here it does.
 */
export type Direction =
  /** Missable in both directions. Calories. */
  | "target"
  /** More is fine, forever. Protein and fibre. */
  | "floor"
  /** Less is better and past it is a real warning. Sodium, and only sodium. */
  | "ceiling";

export type Metric = "calories" | "protein" | "carbs" | "fat" | "fibre" | "sodium";

/**
 * The direction table from S72, declared once.
 *
 * CARBS ARE A TARGET, which S72's table does not state either way. With a
 * balanced split (goals.ts) carbs are whatever calories are left after protein
 * and fat, so they behave like the calorie number they are derived from rather
 * than like a floor somebody set.
 */
export const DIRECTION: Record<Metric, Direction> = {
  calories: "target",
  protein: "floor",
  carbs: "target",
  // FAT IS A TARGET, for the same reason carbs are and against what S72 says.
  // goals.ts splits one calorie number three ways and refuses to save a split
  // that does not add up, so grams of fat are a share rather than a minimum --
  // 131 g against a 54 g share is 693 kcal, a third of the day, and calling it
  // a floor was what made carbs the only macro that could ever turn red.
  fat: "target",
  fibre: "floor",
  // The one genuine health limit in the app (S73), and keeping the exception to
  // exactly one is what preserves the meaning of red.
  sodium: "ceiling",
};

/**
 * `neutral` -- nothing to say, including every in-progress day.
 * `met` -- a floor reached, or a target hit on a finished day.
 * `short` -- a floor missed on a FINISHED day. Never before then.
 * `over` -- past a target or a ceiling.
 */
export type Status = "neutral" | "met" | "short" | "over";

export type Tone = "calm" | "strict";

/**
 * A day in progress is not a day you fell short of (S71).
 *
 * This is arithmetic rather than a tone setting, and it is what makes floors
 * workable at all: a floor is unmet for most of every day, so "under a floor"
 * can only mean something once the day is finished. It applies in BOTH tones.
 */
export function statusOf(
  metric: Metric,
  value: number,
  goal: number | null,
  finished: boolean,
): Status {
  if (goal === null || goal <= 0) return "neutral";

  switch (DIRECTION[metric]) {
    case "ceiling":
      // A ceiling is the one thing that can be breached mid-day and mean it:
      // salt already eaten does not come back out at dinner.
      return value > goal ? "over" : "neutral";

    case "floor":
      // PAST A FLOOR THERE IS NOTHING LEFT TO SAY. Not "over" -- over implies a
      // wrong direction, and 200 g against a 155 g floor is the target hit.
      if (value >= goal) return "met";
      return finished ? "short" : "neutral";

    case "target":
      if (value > goal) return "over";
      if (!finished) return "neutral";
      return value >= goal ? "met" : "short";
  }
}

/**
 * What a status is painted, for every metric and both tones.
 *
 * `met` and `short` were computed by `statusOf` and read by nothing, so strict
 * mode could only ever say that something went wrong. A mode that has no way to
 * say "that landed" is a mode that only punishes, which is not what S79 asked
 * for -- the ask was that strict STATES the numbers, and one of the things the
 * numbers say is that you hit it.
 *
 * In calm mode: still only a ceiling, ever (S70 and its single exception S73).
 * A second exception is how a calm app becomes a strict one by accretion, so
 * the ceiling check is on the METRIC rather than on the status -- an `over`
 * from a calorie target cannot reach this branch by accident. Calm's behaviour
 * is unchanged by any of this.
 */
export type Paint = "none" | "good" | "warn" | "bad";

export function toneOf(metric: Metric, status: Status, tone: Tone = "calm"): Paint {
  if (DIRECTION[metric] === "ceiling") return status === "over" ? "bad" : "none";
  if (tone !== "strict") return "none";

  switch (status) {
    case "met":
      return "good";
    // A floor cannot return `over` (see statusOf), so this only ever fires for
    // a target -- where past it IS the wrong direction.
    case "over":
      return "bad";
    // AMBER, NOT RED. A protein floor missed on a finished day is worth saying
    // and is not a health event; red stays with the ceiling and with the
    // actions that destroy data.
    case "short":
      return "warn";
    default:
      return "none";
  }
}

export function isAlarming(metric: Metric, status: Status, tone: Tone = "calm"): boolean {
  return toneOf(metric, status, tone) === "bad";
}

/**
 * How much of the bar is filled, 0-100.
 *
 * A FLOOR CAN ONLY FILL, AND FULL IS THE END OF IT. No overflow, no second bar
 * for the excess: the bar being full is already the signal that the target is
 * met, and the number beside it is right there for anyone who wants the rest.
 */
export function fillPercent(value: number, goal: number | null): number {
  if (goal === null || goal <= 0) return 0;
  return Math.min(100, Math.max(0, (value / goal) * 100));
}

/**
 * The caption under a number: `left`, `over`, or nothing.
 *
 * Neutral wording throughout (S70). Never "exceeded", never "limit", never
 * "budget", and no punctuation doing emotional work.
 */
export function captionFor(metric: Metric, value: number, goal: number | null): string | null {
  if (goal === null || goal <= 0) return null;
  if (DIRECTION[metric] === "floor" && value >= goal) return null;
  return value > goal ? "over" : "left";
}

/**
 * The two figures in the middle of the calorie ring.
 *
 * CALM SHOWS WHAT YOU ATE. Not what is left: a countdown to zero is a budget
 * draining, and the same subtraction run past the goal turns into a tally of
 * the overshoot in the largest type on the screen. The arc still fills against
 * the goal, so the shape of the day survives -- what goes is the score attached
 * to it. Strict counts down, which is what strict is for.
 *
 * PAST THE GOAL EVEN STRICT STOPS SUBTRACTING (S78). Strict names the overshoot
 * in its own red line under the ring, where a caption can carry it; the biggest
 * number on the screen does not need to be one you are behind by.
 *
 * TAKES THE TONE, and is one of exactly two functions that may (see the S77
 * test). What it chooses is which fact to SHOW -- both figures are the same
 * untouched totals, nothing is stored, and flipping the switch back restores
 * the other reading for every day already logged.
 */
export function ringFigure(
  consumed: number,
  goal: number,
  tone: Tone = "calm",
): { value: number; caption: string | null } {
  if (tone !== "strict" || goal <= 0) return { value: consumed, caption: "eaten" };
  if (consumed <= goal) return { value: goal - consumed, caption: "left" };
  return { value: consumed, caption: "eaten" };
}
