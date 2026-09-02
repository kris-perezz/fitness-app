import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { liftHistory, type Exercise, type WorkoutSet } from "@/lib/training";
import { ExerciseScreen } from "@/components/exercise-screen";

export const dynamic = "force-dynamic";

/**
 * One lift, over months (S80).
 *
 * The chart lives on the EXERCISE rather than on the progress tab, which is
 * S80 correcting S64: "is bench moving" is asked while looking at bench, and
 * answering it on a weekly summary screen means going somewhere else to ask.
 */
export default async function ExercisePage({ params }: PageProps<"/exercise/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: exercise }, { data: slots }, { data: settings }] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, name, aliases, equipment, bodyweight_fraction, load_is_per_side, primary_muscles")
      .eq("id", id)
      .maybeSingle(),
    // `!inner` so a slot without a readable session is dropped rather than
    // arriving with a null date. RLS scopes workouts to the caller, so this is
    // also what keeps the history to your own sessions.
    supabase
      .from("workout_exercises")
      .select("workout:workouts!inner(log_date), sets:workout_sets(*)")
      .eq("exercise_id", id),
    // S81. One row, and the pin is the only column read from it here.
    supabase.from("nutrition_settings").select("pinned_exercise_id").maybeSingle(),
  ]);

  if (!exercise) notFound();

  const rows = (slots ?? []) as unknown as {
    workout: { log_date: string };
    sets: WorkoutSet[];
  }[];

  const { points, sessions } = liftHistory(
    rows.map((row) => ({ log_date: row.workout.log_date, sets: row.sets ?? [] })),
  );

  return (
    <ExerciseScreen
      exercise={exercise as Exercise}
      points={points}
      sessions={sessions}
      pinned={settings?.pinned_exercise_id === id}
    />
  );
}
