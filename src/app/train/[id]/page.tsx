import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { NO_BESTS } from "@/lib/training";
import type {
  Bests,
  Exercise,
  LastSession,
  Workout,
  WorkoutSet,
  WorkoutSlot,
} from "@/lib/training";
import { TrainScreen } from "@/components/train-screen";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ params }: PageProps<"/train/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: row }, { data: exercises }] = await Promise.all([
    // RLS scopes this to the caller, so somebody else's id is a 404 rather than
    // a permission error -- which is the honest answer, since as far as this
    // user is concerned the session does not exist.
    supabase.from("workouts").select("*").eq("id", id).maybeSingle(),
    supabase.from("exercises").select("*").order("name"),
  ]);

  if (!row) notFound();
  const workout = row as Workout;

  const { data: slotRows } = await supabase
    .from("workout_exercises")
    .select("*, sets:workout_sets(*)")
    .eq("workout_id", workout.id)
    .order("sort_order", { ascending: true });

  const slots: WorkoutSlot[] = (slotRows ?? []).map((r) => ({
    id: r.id as string,
    exercise_id: r.exercise_id as string,
    name: r.name as string,
    muscle_group: r.muscle_group as string,
    sort_order: r.sort_order as number,
    sets: ((r.sets ?? []) as WorkoutSet[]).sort((a, b) => a.set_index - b.set_index),
  }));

  const history = await historyFor(supabase, workout, slots);

  return (
    <TrainScreen
      workout={workout}
      slots={slots}
      lastSessions={history.lastSessions}
      bests={history.bests}
      exercises={(exercises ?? []) as Exercise[]}
      today={wakingDate()}
      recentExerciseIds={await recentExerciseIds(supabase)}
    />
  );
}

/**
 * S42/S45/S33. Everything this session needs to know about what came before:
 * what each exercise did LAST time, and its best ever.
 *
 * Both come from the database as ANSWERS rather than as rows to fold here.
 * This used to be one query that fetched every prior slot for every lift in
 * the session with all their sets nested -- a payload that grew with the log
 * for ever, and grew again each time you added a lift, which is what made
 * adding one the slowest thing on the screen. The bests are now an aggregate
 * (0014, exercise_bests); the last session is one slot per lift rather than
 * every slot it has ever had.
 *
 * The unit is the EXERCISE, never the session. A week that runs full body,
 * upper, lower, arms shares almost no lifts between consecutive sessions, so
 * "last time" has to mean the last time you did THIS LIFT.
 *
 * Sessions strictly BEFORE this one, so re-opening a past session cannot
 * suggest itself back to you. RLS restricts all three functions to the caller's
 * own history, so there is no user filter to forget.
 */
async function historyFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workout: Workout,
  slots: WorkoutSlot[],
): Promise<{ lastSessions: Record<string, LastSession>; bests: Record<string, Bests> }> {
  const exerciseIds = [...new Set(slots.map((s) => s.exercise_id))];
  if (exerciseIds.length === 0) return { lastSessions: {}, bests: {} };

  const args = {
    p_exercise_ids: exerciseIds,
    p_before: workout.log_date,
    p_exclude_workout: workout.id,
  };

  // Independent of each other, so they go together rather than in sequence.
  const [bestRows, slotRows] = await Promise.all([
    supabase.rpc("exercise_bests", args),
    supabase.rpc("last_session_slots", args),
  ]);

  const bestByExercise: Record<string, Bests> = {};
  for (const r of (bestRows.data ?? []) as BestRow[]) {
    bestByExercise[r.exercise_id] = {
      e1rm: Number(r.e1rm),
      repBand: Number(r.rep_band),
      single: Number(r.single),
    };
  }

  const found = (slotRows.data ?? []) as LastSlotRow[];

  // The one place real set rows are still needed -- and now only for the slots
  // named above, which is one per lift.
  const setsBySlot: Record<string, WorkoutSet[]> = {};
  if (found.length > 0) {
    const { data: setRows } = await supabase
      .from("workout_sets")
      .select("*")
      .in(
        "workout_exercise_id",
        found.map((r) => r.workout_exercise_id),
      );
    for (const set of (setRows ?? []) as WorkoutSet[]) {
      (setsBySlot[set.workout_exercise_id] ??= []).push(set);
    }
    for (const list of Object.values(setsBySlot)) {
      list.sort((a, b) => a.set_index - b.set_index);
    }
  }

  const lastByExercise: Record<string, LastSession> = {};
  for (const r of found) {
    const sets = setsBySlot[r.workout_exercise_id] ?? [];
    if (sets.length > 0) lastByExercise[r.exercise_id] = { sets, date: r.log_date };
  }

  // Keyed by slot, not by exercise, so the same lift twice in one session gets
  // the same history in both slots without the caller re-mapping it.
  const lastSessions: Record<string, LastSession> = {};
  const bests: Record<string, Bests> = {};
  for (const slot of slots) {
    const last = lastByExercise[slot.exercise_id];
    if (last) lastSessions[slot.id] = last;
    bests[slot.id] = bestByExercise[slot.exercise_id] ?? NO_BESTS;
  }
  return { lastSessions, bests };
}

/** Numeric comes back from PostgREST as a string; Number() at the boundary. */
type BestRow = { exercise_id: string; e1rm: string; rep_band: string; single: string };
type LastSlotRow = { exercise_id: string; workout_exercise_id: string; log_date: string };

/**
 * S27's "recent exercises above search", in its thinnest form: the lifts from
 * the caller's most recent sessions, newest first. Frequency ranking can come
 * later -- recency alone already covers the case that most sessions repeat.
 */
async function recentExerciseIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const { data } = await supabase
    .from("workout_exercises")
    .select("exercise_id, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  return [...new Set((data ?? []).map((r) => r.exercise_id as string))].slice(0, 8);
}
