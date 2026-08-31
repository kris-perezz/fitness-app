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
  is_unilateral: boolean;
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
 * The next row's starting point: the last set that was actually performed.
 * A skipped set is a poor prescription for the next one, so it is passed over
 * rather than copied -- which is the point of recording the skip at all (S25).
 */
export function nextDraft(sets: WorkoutSet[], prefill: SetDraft[]): SetDraft {
  const performed = [...sets].reverse().find((s) => !s.skipped);
  if (performed) {
    return { reps: performed.reps, load_lb: performed.load_lb, set_type: performed.set_type };
  }
  // Nothing confirmed yet in this slot: fall back to what last session did, and
  // to a genuinely empty row if there is no last session (S23 -- empty, never
  // zeros, because a zero is a claim and a blank is not).
  const next = prefill[sets.length];
  return next ?? { reps: null, load_lb: 0, set_type: "straight" };
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
