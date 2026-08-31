import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { NO_BESTS, foldBest } from "@/lib/training";
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
 * One query serves both. The rows are already being fetched for the
 * suggestion -- every earlier slot for the exercises in play, newest first -- so
 * the all-time bests are a second fold over the same data rather than a second
 * round trip.
 *
 * The unit is the EXERCISE, never the session. A week that runs full body,
 * upper, lower, arms shares almost no lifts between consecutive sessions, so
 * "what did I do last workout" is the wrong question -- "what did I do last
 * time I benched" is the right one, and it is the only one asked here.
 *
 * Bounded by this session's DATE, not merely by its id (S51). A session added
 * for last Monday must not be pre-filled from last Friday: that is a suggestion
 * from the future, and left unchecked it quietly becomes the thing you "did".
 *
 * One query for the whole session rather than one per slot: pull every earlier
 * slot for the exercises in play, newest first, and keep the first one seen per
 * exercise. RLS already restricts this to the caller's own history, so there is
 * no user filter to forget.
 */
async function historyFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workout: Workout,
  slots: WorkoutSlot[],
): Promise<{ lastSessions: Record<string, LastSession>; bests: Record<string, Bests> }> {
  const exerciseIds = [...new Set(slots.map((s) => s.exercise_id))];
  if (exerciseIds.length === 0) return { lastSessions: {}, bests: {} };

  const { data } = await supabase
    .from("workout_exercises")
    .select("exercise_id, created_at, workout:workouts!inner(log_date), sets:workout_sets(*)")
    .in("exercise_id", exerciseIds)
    .neq("workout_id", workout.id)
    .lt("workout.log_date", workout.log_date)
    .order("created_at", { ascending: false });

  const lastByExercise: Record<string, LastSession> = {};
  const bestByExercise: Record<string, Bests> = {};

  for (const row of data ?? []) {
    const exerciseId = row.exercise_id as string;
    const sets = ((row.sets ?? []) as WorkoutSet[])
      .slice()
      .sort((a, b) => a.set_index - b.set_index);
    if (sets.length === 0) continue;

    // Every row folds into the all-time bests (S33)...
    bestByExercise[exerciseId] = sets.reduce(foldBest, bestByExercise[exerciseId] ?? NO_BESTS);

    // ...but only the newest is the last session (S42/S45). Rows arrive newest
    // first, so the first one seen per exercise wins.
    if (!(exerciseId in lastByExercise)) {
      const parent = row.workout as unknown as { log_date: string } | null;
      lastByExercise[exerciseId] = { sets, date: parent?.log_date ?? "" };
    }
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
