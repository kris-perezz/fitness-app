/**
 * Lifting types and the small amount of arithmetic the log needs (S22-S28).
 *
 * There is deliberately no progression model here. The one idea worth taking
 * from RP Hypertrophy was that a set row arrives PRE-FILLED and gets confirmed;
 * what it is pre-filled with is last session's numbers, which is a query rather
 * than an algorithm. No formula, no coefficients, nothing to tune. The app
 * shows what happened and gets out of the way, and that restraint is the design.
 */

import { searchNamed } from "./search";

export type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  muscle_group: string;
  equipment: string | null;
  /** S29. Null means this is not a bodyweight movement. Nothing reads it yet. */
  bodyweight_fraction: number | null;
  /** Open decision 4, still deferred. Not the same question as the next field. */
  is_unilateral: boolean;
  /**
   * S49. Whether `load_lb` is the weight in ONE hand or on one side -- a
   * dumbbell, a plate-loaded arm -- rather than the whole movement. Nothing is
   * ever doubled from it; it exists so the field says which number to type.
   */
  load_is_per_side: boolean;
};

/** Only the two that are implemented; the column pins the rest (decision 5). */
export type SetType = "straight" | "warmup" | "drop" | "myorep" | "top" | "backoff";

export type WorkoutSet = {
  id: string;
  workout_exercise_id: string;
  set_index: number;
  reps: number | null;
  /** Pounds (decision 1). Zero is real and means bodyweight only. */
  load_lb: number;
  /** S24. Null is "not recorded"; 0 is "taken to failure". Never collapse them. */
  rir: number | null;
  /**
   * S25, no longer reachable from the UI (S46). It existed so that pre-fill
   * would not inherit a set you never did; suggestions now come from your best
   * recent set or from the set you just did, so an absent set is simply absent.
   * The column stays, so bringing it back is a UI change and not a migration.
   */
  skipped: boolean;
  set_type: SetType;
};

/** An ordered slot in a session. Sets hang off this, never off the exercise. */
export type WorkoutSlot = {
  id: string;
  exercise_id: string;
  /** Denormalised at log time so recategorising an exercise cannot rewrite it. */
  name: string;
  muscle_group: string;
  sort_order: number;
  sets: WorkoutSet[];
};

export type Workout = {
  id: string;
  log_date: string;
  started_at: string;
  ended_at: string | null;
  bodyweight_lb: number | null;
};

/** What a pre-filled row starts as, before anyone confirms it (S23). */
export type SetDraft = {
  reps: number | null;
  load_lb: number;
  set_type: SetType;
};

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Rear delts",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
] as const;

export const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Bodyweight",
  "Other",
] as const;

/**
 * Can this lift honestly be logged with no external load? (S47)
 *
 * `load_lb = 0` means bodyweight, which is a real answer for a pull-up and a
 * nonsense one for a bench press. Either signal is enough: the seed set seeds
 * `bodyweight_fraction` for genuine bodyweight movements, and a user-created
 * exercise only carries `equipment`, so both are checked.
 */
export function allowsBodyweight(exercise: Exercise | null): boolean {
  if (!exercise) return false;
  return exercise.bodyweight_fraction != null || exercise.equipment === "Bodyweight";
}

/**
 * What to call the load field (S49). The convention is stated at the point of
 * entry so the same lift cannot be logged 140 one week and 70 the next -- which
 * is the failure that actually corrupts a series, and the one no amount of
 * arithmetic downstream can undo.
 */
export function loadLabel(exercise: Exercise | null): string {
  return exercise?.load_is_per_side ? "Load per side (lb)" : "Load (lb)";
}

/** S27: the same ranking the food picker uses, because it is the same function. */
export function searchExercises(exercises: Exercise[], query: string): Exercise[] {
  return searchNamed(exercises, query);
}

/**
 * S32's definition, stated here once even though the volume view is not built:
 * a warm-up is not a hard set, and neither is a set you did not do.
 */
export function isHardSet(set: WorkoutSet): boolean {
  return !set.skipped && set.set_type !== "warmup";
}

/**
 * How a confirmed set reads back. Bodyweight movements log `load_lb = 0`, which
 * is a real answer rather than a missing one, so it gets a word instead of "0 lb".
 */
export function setSummary(set: WorkoutSet): string {
  if (set.skipped) return "Skipped";
  const reps = set.reps ?? 0;
  const load = set.load_lb === 0 ? "bodyweight" : `${trim(set.load_lb)} lb`;
  const rir = set.rir === null ? "" : set.rir === 0 ? " · to failure" : ` · ${set.rir} RIR`;
  return `${reps} × ${load}${rir}`;
}

/**
 * Estimated one-rep max, Brzycki: `load × 36 / (37 - reps)`.
 *
 * Used to pick which of last session's sets to suggest (S45) and, later, to
 * notice a PR when more reps at the same weight beat a heavier single (S33).
 * One formula, defined once, so those two can never disagree about what
 * "better" means.
 *
 * Brzycki and Epley agree exactly at 10 reps. Below that Brzycki is the more
 * conservative of the two; above it, it climbs faster -- so on this formula a
 * set of 20 is ranked further ahead of a heavy triple than Epley would rank it.
 * That is a real difference for a log with 15- and 20-rep accessory work in it,
 * and it is the intended behaviour, not a side effect.
 *
 * The denominator reaches zero at 37 reps and turns negative past it, which
 * would sort a genuine top set BELOW a light one. Reps are clamped to 36 so the
 * result stays positive and stays monotonic in reps -- an estimate off a set of
 * 37+ is meaningless either way, but a negative one would be actively wrong.
 */
export function estimated1RM(loadLb: number, reps: number | null): number {
  const r = reps ?? 0;
  if (r <= 0) return 0;
  if (r === 1) return loadLb;
  return (loadLb * 36) / (37 - Math.min(r, 36));
}

/**
 * Last session's best set of a lift: the one with the highest estimated 1RM
 * (S45). Warm-ups and skipped sets are not candidates -- a warm-up is not what
 * you want suggested as the opening set of today's work.
 */
export function bestSet(sets: WorkoutSet[]): WorkoutSet | null {
  const candidates = sets.filter(isHardSet);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, set) =>
    estimated1RM(set.load_lb, set.reps) > estimated1RM(best.load_lb, best.reps) ? set : best,
  );
}

/**
 * The last time an exercise was trained: its sets, and when. Lives here rather
 * than on the route that queries it -- a page file is a strange home for a type
 * two other modules need.
 */
export type LastSession = { sets: WorkoutSet[]; date: string };

/** Where a suggested set came from, so the sheet can say so out loud. */
export type Suggestion = {
  draft: SetDraft;
  /** "Set 2 today" or "Mon 25 Aug", shown on the Previous line. */
  from: string;
  detail: string;
};

/**
 * What to pre-fill the Add-set sheet with (S45).
 *
 * The rule changes with where you are in the exercise, because what is
 * informative changes:
 *
 *   - FIRST set of this exercise today -> last session's best set. You have no
 *     information about today yet, so the most useful anchor is your best
 *     recent effort at this lift.
 *   - SECOND set onward -> the set you just did. By then today's information
 *     beats last week's outright: you already know how the weight is moving.
 *
 * Returns null when there is nothing to suggest -- the first time you ever do a
 * lift opens an empty sheet, because a zero is a claim and a blank is not.
 */
export function suggestFor(
  setsToday: WorkoutSet[],
  lastSession: { sets: WorkoutSet[]; date: string } | null,
): Suggestion | null {
  const prior = [...setsToday].reverse().find(isHardSet);
  if (prior) {
    return {
      draft: { reps: prior.reps, load_lb: prior.load_lb, set_type: "straight" },
      from: `Set ${prior.set_index + 1} today`,
      detail: loadReps(prior.load_lb, prior.reps),
    };
  }

  if (!lastSession) return null;
  const best = bestSet(lastSession.sets);
  if (!best) return null;

  return {
    draft: { reps: best.reps, load_lb: best.load_lb, set_type: "straight" },
    from: shortDate(lastSession.date),
    detail: loadReps(best.load_lb, best.reps),
  };
}

/** "100 lb × 12", or "bodyweight × 12" where the load is a real zero (S29). */
export function loadReps(loadLb: number, reps: number | null): string {
  const load = loadLb === 0 ? "bodyweight" : `${trim(loadLb)} lb`;
  return `${load} × ${reps ?? 0}`;
}

/** "Mon 25 Aug" -- midday so a date-only string cannot drift a day on parse. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Trailing-zero-free pounds: 135 not 135.0, but 132.5 stays 132.5. */
export function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * A session left open overnight closes rather than absorbing the next day's
 * sets (S26). The comparison is against the waking date, so a set logged at
 * 01:00 still belongs to the session you started the evening before.
 */
export function isStale(workout: Workout, today: string): boolean {
  return workout.ended_at === null && workout.log_date !== today;
}
