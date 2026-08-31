"use server";

/**
 * Lifting actions (S22-S28). A separate module from `actions.ts` rather than an
 * addition to it: the food side is already 600 lines, the two domains share
 * nothing but the Supabase client, and "use server" files are the one place
 * where a big file is genuinely harder to read -- every export in here is a
 * network endpoint.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import type { Exercise, SetType } from "@/lib/training";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The open session, opening one if there is none (S22: logging never requires
 * choosing a session first). Also closes a session left open overnight, so it
 * cannot absorb the next day's sets (S26).
 */
export async function currentWorkout(): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, error: "Not signed in" };

  const today = wakingDate();

  const { data: open, error } = await supabase
    .from("workouts")
    .select("id, log_date")
    .is("ended_at", null)
    .maybeSingle();
  if (error) return { id: null, error: error.message };

  if (open) {
    if (open.log_date === today) return { id: open.id as string, error: null };
    // Yesterday's session, still open. Close it at its own date rather than
    // rolling it forward -- what happened yesterday happened yesterday.
    const closed = await closeWorkout(supabase, open.id as string, user.id);
    if (closed) return { id: null, error: closed };
  }

  const { data, error: insertError } = await supabase
    .from("workouts")
    .insert({ user_id: user.id, log_date: today })
    .select("id")
    .single();
  if (insertError) return { id: null, error: insertError.message };

  revalidatePath("/train");
  return { id: data.id as string, error: null };
}

export async function finishWorkout(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const failed = await closeWorkout(supabase, id, user.id);
  if (failed) return { error: failed };

  revalidatePath("/train");
  return { error: null };
}

/**
 * Deletes an empty session outright rather than closing it. An abandoned
 * session with no sets in it is not history, it is litter -- and leaving it
 * closed-but-empty would clutter every future "what did I do last time" read.
 */
export async function discardWorkout(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("workouts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

/**
 * Add an exercise slot. The name and muscle group are copied onto the slot at
 * this moment and never read from `exercises` again, so recategorising a lift
 * cannot rewrite what past sessions say it was (S32 -- the same rule as S7 and
 * S19, third statement of it).
 */
export async function addWorkoutExercise(
  workoutId: string,
  exerciseId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await ownsWorkout(supabase, workoutId, user.id);
  if (owned) return { error: owned };

  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, name, muscle_group")
    .eq("id", exerciseId)
    .maybeSingle();
  if (exerciseError) return { error: exerciseError.message };
  if (!exercise) return { error: "Exercise not found" };

  const { data: last, error: lastError } = await supabase
    .from("workout_exercises")
    .select("sort_order")
    .eq("workout_id", workoutId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: lastError.message };

  const { error } = await supabase.from("workout_exercises").insert({
    workout_id: workoutId,
    exercise_id: exercise.id,
    name: exercise.name,
    muscle_group: exercise.muscle_group,
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  });
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

export async function removeWorkoutExercise(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_exercises").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

export type SetInput = {
  set_index: number;
  reps: number | null;
  load_lb: number;
  rir: number | null;
  skipped: boolean;
  set_type: SetType;
};

/**
 * Confirm a set (S22). A row exists in `workout_sets` only once it has been
 * confirmed -- the pre-filled rows on screen are drafts in the browser, which
 * is why there is no `done` column here. "Not yet confirmed" and "confirmed"
 * are then the same distinction as "no row" and "row", with nothing to keep in
 * sync.
 */
export async function logSet(workoutExerciseId: string, input: SetInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const invalid = validateSet(input);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("workout_sets").insert({
    workout_exercise_id: workoutExerciseId,
    ...input,
  });
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

export async function updateSet(id: string, input: Omit<SetInput, "set_index">) {
  const supabase = await createClient();
  const invalid = validateSet(input);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("workout_sets").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

export async function deleteSet(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_sets").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train");
  return { error: null };
}

/**
 * S28. Created from the picker, the way a food is, rather than on a screen of
 * its own -- an unknown lift is a dead end otherwise, and a dead end mid-session
 * is when people stop logging.
 */
export async function createExercise(input: {
  name: string;
  muscle_group: string;
  equipment: string | null;
}): Promise<{ exercise: Exercise | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { exercise: null, error: "Not signed in" };

  const name = input.name.trim();
  if (!name) return { exercise: null, error: "Name is required" };
  if (!input.muscle_group) return { exercise: null, error: "Muscle group is required" };

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      // Slug plus a short random tail: two people inventing "Machine row" must
      // not collide on the primary key, and the seed set already owns the tidy
      // slugs.
      id: `${slug(name)}_${crypto.randomUUID().slice(0, 8)}`,
      name,
      aliases: [],
      muscle_group: input.muscle_group,
      equipment: input.equipment,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return { exercise: null, error: error.message };

  revalidatePath("/train");
  return { exercise: data as Exercise, error: null };
}

// ------------------------------------------------------------------ helpers

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "exercise"
  );
}

function validateSet(input: Omit<SetInput, "set_index">): string | null {
  if (input.reps !== null && (!Number.isFinite(input.reps) || input.reps < 0)) {
    return "Reps must be zero or more";
  }
  if (!Number.isFinite(input.load_lb) || input.load_lb < 0) {
    return "Load must be zero or more";
  }
  // 0 is a real value -- taken to failure -- so only the absurd end is rejected.
  if (input.rir !== null && (!Number.isFinite(input.rir) || input.rir < 0 || input.rir > 10)) {
    return "RIR must be between 0 and 10";
  }
  return null;
}

/** Null when the caller owns the workout, an error string otherwise. */
async function ownsWorkout(
  supabase: ServerClient,
  workoutId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Session not found";
  return null;
}

/** Closes a session, and deletes it instead if nothing was logged in it. */
async function closeWorkout(
  supabase: ServerClient,
  workoutId: string,
  userId: string,
): Promise<string | null> {
  const { count, error: countError } = await supabase
    .from("workout_exercises")
    .select("id", { count: "exact", head: true })
    .eq("workout_id", workoutId);
  if (countError) return countError.message;

  if (!count) {
    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", userId);
    return error ? error.message : null;
  }

  const { error } = await supabase
    .from("workouts")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", workoutId)
    .eq("user_id", userId);
  return error ? error.message : null;
}
