import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import type {
  Exercise,
  SetDraft,
  Workout,
  WorkoutSet,
  WorkoutSlot,
} from "@/lib/training";
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
        prefills={{}}
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
      prefills={await prefillsFor(supabase, workout.id, slots)}
      exercises={(exercises ?? []) as Exercise[]}
      today={today}
      recentExerciseIds={await recentExerciseIds(supabase)}
    />
  );
}

/**
 * S23. What each exercise in this session did LAST time, as editable defaults.
 *
 * One query for the whole session rather than one per slot: pull every earlier
 * slot for the exercises in play, newest first, and keep the first one seen per
 * exercise. RLS already restricts this to the caller's own history, so there is
 * no user filter to forget.
 *
 * This is the entire progression model. No formula, no coefficients -- the app
 * shows what happened and gets out of the way.
 */
async function prefillsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workoutId: string,
  slots: WorkoutSlot[],
): Promise<Record<string, SetDraft[]>> {
  const exerciseIds = [...new Set(slots.map((s) => s.exercise_id))];
  if (exerciseIds.length === 0) return {};

  const { data } = await supabase
    .from("workout_exercises")
    .select("exercise_id, created_at, sets:workout_sets(*)")
    .in("exercise_id", exerciseIds)
    .neq("workout_id", workoutId)
    .order("created_at", { ascending: false });

  const byExercise: Record<string, SetDraft[]> = {};
  for (const row of data ?? []) {
    const id = row.exercise_id as string;
    if (id in byExercise) continue; // newest wins; the rest is older history

    const sets = ((row.sets ?? []) as WorkoutSet[])
      .slice()
      .sort((a, b) => a.set_index - b.set_index)
      // A skipped set is not a prescription for next week (S25).
      .filter((s) => !s.skipped);

    byExercise[id] = sets.map((s) => ({
      reps: s.reps,
      load_lb: s.load_lb,
      set_type: s.set_type,
    }));
  }

  // Keyed by slot, not by exercise, so the same lift twice in one session gets
  // the same pre-fill in both slots without the caller having to re-map it.
  const out: Record<string, SetDraft[]> = {};
  for (const slot of slots) out[slot.id] = byExercise[slot.exercise_id] ?? [];
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
