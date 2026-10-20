import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, must } from "@/lib/supabase/server";
import { liftHistory, type Exercise, type WorkoutSet } from "@/lib/training";
import { ExerciseScreen } from "@/components/exercise-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/exercise/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Exercise" };
}

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

  const [exercise, slots, pin, settings] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, name, aliases, equipment, bodyweight_fraction, load_is_per_side, primary_muscles")
      .eq("id", id)
      .maybeSingle()
      .then(must),
    // `!inner` so a slot without a readable session is dropped rather than
    // arriving with a null date. RLS scopes workouts to the caller, so this is
    // also what keeps the history to your own sessions.
    supabase
      .from("workout_exercises")
      .select("workout:workouts!inner(log_date), sets:workout_sets(*)")
      .eq("exercise_id", id)
      .then(must),
    // S81/0033. At most one row, and its existence IS the answer -- pins are
    // a set now, so this asks about this lift rather than reading the pin.
    supabase.from("pinned_exercises").select("exercise_id").eq("exercise_id", id).maybeSingle().then(must),
    supabase.from("nutrition_settings").select("display_weight_unit").maybeSingle().then(must),
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
      pinned={pin != null}
      unit={settings?.display_weight_unit === "kg" ? "kg" : "lb"}
    />
  );
}
