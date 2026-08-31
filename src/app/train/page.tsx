import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import type { Exercise, Workout, WorkoutSet, WorkoutSlot } from "@/lib/training";

/** Last time this exercise was trained: its sets, and when. */
export type LastSession = { sets: WorkoutSet[]; date: string };
import { TrainScreen } from "@/components/train-screen";

export const dynamic = "force-dynamic";

export default async function TrainPage() {
  const supabase = await createClient();
  const today = wakingDate();

  const [{ data: openRows }, { data: exercises }] = await Promise.all([
    // RLS scopes this to the caller. Ordered so that a stale session left open
    // from a previous day is still found -- closing it is the client's first
    // action, not something a read should be doing silently.
    supabase.from("workouts").select("*").is("ended_at", null).limit(1),
    supabase.from("exercises").select("*").order("name"),
  ]);

  const workout = (openRows?.[0] ?? null) as Workout | null;

  if (!workout) {
    return (
      <TrainScreen
        workout={null}
        slots={[]}
        lastSessions={{}}
        exercises={(exercises ?? []) as Exercise[]}
        today={today}
        recentExerciseIds={await recentExerciseIds(supabase)}
      />
    );
  }

  const { data: slotRows } = await supabase
    .from("workout_exercises")
    .select("*, sets:workout_sets(*)")
    .eq("workout_id", workout.id)
    .order("sort_order", { ascending: true });

  const slots: WorkoutSlot[] = (slotRows ?? []).map((row) => ({
    id: row.id as string,
    exercise_id: row.exercise_id as string,
    name: row.name as string,
    muscle_group: row.muscle_group as string,
    sort_order: row.sort_order as number,
    sets: ((row.sets ?? []) as WorkoutSet[]).sort((a, b) => a.set_index - b.set_index),
  }));

  return (
    <TrainScreen
      workout={workout}
      slots={slots}
      lastSessions={await lastSessionsFor(supabase, workout.id, slots)}
      exercises={(exercises ?? []) as Exercise[]}
      today={today}
      recentExerciseIds={await recentExerciseIds(supabase)}
    />
  );
}

/**
 * S42/S45. What each exercise in this session did the last time it was trained.
 *
 * The unit is the EXERCISE, never the session. A week that runs full body,
 * upper, lower, arms shares almost no lifts between consecutive sessions, so
 * "what did I do last workout" is the wrong question -- "what did I do last
 * time I benched" is the right one, and it is the only one asked here.
 *
 * One query for the whole session rather than one per slot: pull every earlier
 * slot for the exercises in play, newest first, and keep the first one seen per
 * exercise. RLS already restricts this to the caller's own history, so there is
 * no user filter to forget.
 *
 * The DATE comes along because the suggestion says where it came from, and
 * "Mon 25 Aug" is the difference between a number you trust and a number you
 * wonder about.
 */
async function lastSessionsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workoutId: string,
  slots: WorkoutSlot[],
): Promise<Record<string, LastSession>> {
  const exerciseIds = [...new Set(slots.map((s) => s.exercise_id))];
  if (exerciseIds.length === 0) return {};

  const { data } = await supabase
    .from("workout_exercises")
    .select("exercise_id, created_at, workout:workouts!inner(log_date), sets:workout_sets(*)")
    .in("exercise_id", exerciseIds)
    .neq("workout_id", workoutId)
    .order("created_at", { ascending: false });

  const byExercise: Record<string, LastSession> = {};
  for (const row of data ?? []) {
    const id = row.exercise_id as string;
    if (id in byExercise) continue; // newest wins; the rest is older history

    const sets = ((row.sets ?? []) as WorkoutSet[])
      .slice()
      .sort((a, b) => a.set_index - b.set_index);
    if (sets.length === 0) continue;

    const workout = row.workout as unknown as { log_date: string } | null;
    byExercise[id] = { sets, date: workout?.log_date ?? "" };
  }

  // Keyed by slot, not by exercise, so the same lift twice in one session gets
  // the same history in both slots without the caller re-mapping it.
  const out: Record<string, LastSession> = {};
  for (const slot of slots) {
    const found = byExercise[slot.exercise_id];
    if (found) out[slot.id] = found;
  }
  return out;
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
