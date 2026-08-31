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
  /**
   * S32. Volume counts a working set 1.0 for each primary muscle and 0.5 for
   * each secondary one. Primary is a LIST because a dip is direct work for both
   * chest and triceps, and forcing one winner makes it a lie either way.
   */
  primary_muscles: string[];
  secondary_muscles: string[];
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

/**
 * S32. The volume vocabulary, and the only muscle names the database accepts --
 * `exercises_muscles_known` in 0013 pins the same sixteen, so adding one here
 * without a migration produces a constraint violation rather than a new group.
 *
 * Back is split into Lats / Upper back / Lower back because one Back group let
 * a month of nothing but pulldowns read as a fully trained back. Exercises
 * created before 0013 keep whatever `muscle_group` they were given, so "Back"
 * still exists in that column and is still displayed; it is simply no longer
 * offered.
 */
export const MUSCLE_GROUPS = [
  "Chest",
  "Lats",
  "Upper back",
  "Lower back",
  "Traps",
  "Shoulders",
  "Rear delts",
  "Biceps",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Adductors",
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
 * A set that counts. Warm-ups do not, and neither does one you did not do.
 *
 * Called a WORKING set, not a "hard set". Hard set is RP vocabulary and it
 * asserts proximity to failure -- something this app records in `rir` and
 * deliberately does not check here. Naming the function after a claim the query
 * does not make is how a definition quietly drifts from its name.
 */
export function isWorkingSet(set: WorkoutSet): boolean {
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
 * Estimated one-rep max, Brzycki: `load x 36 / (37 - reps)`.
 *
 * Brzycki over Epley because a single returns the load exactly -- 185 x 1 is a
 * 185 lb max, where Epley would call it 191.
 *
 * **It means nothing above about ten reps, and comparing across that line is
 * nonsense.** Unbounded, it rates a 140 x 30 squat at e720 against a genuine
 * 315 single. That is why it does not appear in the S45 suggestion at all, and
 * why every comparison here happens strictly inside one rep band.
 *
 * Reps are clamped at 36 because the denominator hits zero at 37 and turns
 * negative beyond, which would sort a genuine top set below a light one. That
 * guard is arithmetic; the banding above is the part that matters.
 */
export function estimated1RM(loadLb: number, reps: number | null): number {
  const r = reps ?? 0;
  if (r <= 0) return 0;
  if (r === 1) return loadLb;
  return (loadLb * 36) / (37 - Math.min(r, 36));
}

/** Above this, a set is judged as a rep effort rather than as a projected max. */
export const REP_CAP = 10;

/**
 * The three kinds of best, kept apart (S33).
 *
 * An estimated max and a measured single are different claims, and a twenty-rep
 * set is not a worse version of a heavy triple. Collapsing them into one number
 * is what makes an app congratulate you on a 140 lb squat.
 */
export type Bests = {
  /** Highest estimated 1RM among sets of 1-REP_CAP reps. */
  e1rm: number;
  /** Highest estimated 1RM among sets above REP_CAP, compared only to each other. */
  repBand: number;
  /** Heaviest actual single. Measured, not projected. */
  single: number;
};

export const NO_BESTS: Bests = { e1rm: 0, repBand: 0, single: 0 };

export type PrKind = "single" | "e1rm" | "rep";

/** Fold a set into a running best. Warm-ups and skipped sets never count. */
export function foldBest(bests: Bests, set: WorkoutSet): Bests {
  if (!isWorkingSet(set)) return bests;
  const reps = set.reps ?? 0;
  if (reps <= 0) return bests;

  const e = estimated1RM(set.load_lb, set.reps);
  return {
    e1rm: reps <= REP_CAP ? Math.max(bests.e1rm, e) : bests.e1rm,
    repBand: reps > REP_CAP ? Math.max(bests.repBand, e) : bests.repBand,
    single: reps === 1 ? Math.max(bests.single, set.load_lb) : bests.single,
  };
}

/**
 * Did this set beat anything? (S33)
 *
 * Each band is compared only against its own history, so a set of twenty is
 * measured against your other sets of twenty and never against a heavy single.
 * A true single reports as a single even though it also moves the e1RM number:
 * "you lifted more than you have ever lifted" is a bigger fact than an estimate
 * going up, and it is the one worth saying.
 *
 * Returns null on a first-ever set of a lift. Everything beats nothing, and
 * announcing that is noise rather than news.
 */
export function prFor(set: WorkoutSet, bests: Bests): PrKind | null {
  if (!isWorkingSet(set)) return null;
  const reps = set.reps ?? 0;
  if (reps <= 0) return null;

  if (reps === 1 && bests.single > 0 && set.load_lb > bests.single) return "single";

  const e = estimated1RM(set.load_lb, set.reps);
  if (reps <= REP_CAP) return bests.e1rm > 0 && e > bests.e1rm ? "e1rm" : null;
  return bests.repBand > 0 && e > bests.repBand ? "rep" : null;
}

/** What to say when one lands. Short: it is read mid-session, standing up. */
export function prMessage(kind: PrKind, exerciseName: string): string {
  switch (kind) {
    case "single":
      return `Heaviest ${exerciseName} single yet`;
    case "e1rm":
      return `Strongest ${exerciseName} set yet`;
    case "rep":
      return `Best high-rep ${exerciseName} set yet`;
  }
}

/**
 * The last time an exercise was trained: its sets, and when. Lives here rather
 * than on the route that queries it -- a page file is a strange home for a type
 * two other modules need.
 */
export type LastSession = { sets: WorkoutSet[]; date: string };

/**
 * The set to open with: the heaviest one, ties broken by more reps (S45).
 *
 * No estimated 1RM anywhere in this path, and that is deliberate. Converting a
 * set to a projected single is only meaningful up to about ten reps, and
 * bounding the comparison to fix that produced a worse bug: a session of
 * 25 x 15, 25 x 12, 25 x 10 collapsed to the only set under the bound and
 * suggested 25 x 10 -- the weakest of the three. Load with reps as the
 * tie-break needs no formula, no cap and no rep bands, and cannot rank a
 * 140 x 30 squat above a 315 single because it converts nothing.
 *
 * The estimate still belongs in PR detection (S33), where the comparison is
 * bounded to a rep range by design. It does not belong here.
 *
 * Warm-ups and skipped sets are never candidates: a warm-up is not what you
 * want offered as the opening set of today's work.
 */
export function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  const candidates = sets.filter(isWorkingSet);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, set) => {
    if (set.load_lb !== best.load_lb) return set.load_lb > best.load_lb ? set : best;
    return (set.reps ?? 0) > (best.reps ?? 0) ? set : best;
  });
}

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
  const prior = [...setsToday].reverse().find(isWorkingSet);
  if (prior) {
    return {
      draft: { reps: prior.reps, load_lb: prior.load_lb, set_type: "straight" },
      from: `Set ${prior.set_index + 1} today`,
      detail: loadReps(prior.load_lb, prior.reps),
    };
  }

  if (!lastSession) return null;
  const best = topSet(lastSession.sets);
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
