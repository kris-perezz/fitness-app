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
 * The session for a given day, created if it does not exist yet (S52).
 *
 * One action, not two. With at most one session per date there is exactly one
 * thing a date can refer to, so "start today" and "add last Tuesday" stopped
 * being different questions -- which is why the screen has one button.
 *
 * Today's session is created OPEN, because you are about to train. Any earlier
 * day is created already finished: "open" means "I am training right now",
 * which can only be one thing and can only be today (S51).
 */
export async function openWorkoutOn(
  date: string,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, error: "Not signed in" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { id: null, error: "Not a valid date" };

  const today = wakingDate();
  // A workout you have not done yet is a plan, and planning is out of scope
  // (open decision 2). The picker does not offer future dates; this is what
  // makes that a rule rather than a convention.
  if (date > today) return { id: null, error: "That day has not happened yet" };

  // Anything left open from an earlier day is over, whatever the button says.
  const stale = await closeStaleWorkout(supabase, user.id, today);
  if (stale) return { id: null, error: stale };

  const { data: existing, error: findError } = await supabase
    .from("workouts")
    .select("id")
    .eq("log_date", date)
    .maybeSingle();
  if (findError) return { id: null, error: findError.message };
  if (existing) return { id: existing.id as string, error: null };

  const { data, error } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      log_date: date,
      ended_at: date === today ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };

  revalidatePath("/train", "layout");
  return { id: data.id as string, error: null };
}

/**
 * Close a session left open on an earlier day (S53).
 *
 * Forgetting to press Finish is the normal case, not an edge one -- the last
 * thing you do in a gym is leave. So a session whose date is not today is over
 * by definition, and this is called on viewing the train tab as well as before
 * opening any session, rather than waiting for the next deliberate action.
 *
 * Safe to call when there is nothing to close, and safe to call twice.
 */
export async function closeStaleWorkouts(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const failed = await closeStaleWorkout(supabase, user.id, wakingDate());
  if (failed) return { error: failed };

  revalidatePath("/train", "layout");
  return { error: null };
}

export async function finishWorkout(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const failed = await closeWorkout(supabase, id, user.id);
  if (failed) return { error: failed };

  revalidatePath("/train", "layout");
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

  revalidatePath("/train", "layout");
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
    .select("id, name, muscle_group, primary_muscles, secondary_muscles")
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
    // Denormalised at log time like name and muscle_group above (S32):
    // reclassifying the exercise later must not rewrite this session.
    primary_muscles: exercise.primary_muscles,
    secondary_muscles: exercise.secondary_muscles,
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  });
  if (error) return { error: error.message };

  revalidatePath("/train", "layout");
  return { error: null };
}

export async function removeWorkoutExercise(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_exercises").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train", "layout");
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

  revalidatePath("/train", "layout");
  return { error: null };
}

export async function updateSet(id: string, input: Omit<SetInput, "set_index">) {
  const supabase = await createClient();
  const invalid = validateSet(input);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("workout_sets").update(input).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train", "layout");
  return { error: null };
}

export async function deleteSet(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_sets").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/train", "layout");
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
      // S32. The one group chosen above IS the primary muscle -- without this a
      // custom exercise is loggable but counts toward nothing, which is the one
      // failure the volume view cannot show you. Secondaries are left empty
      // rather than guessed; a blank 0.5 column is honest, an invented one is
      // not. `exercises_muscles_known` rejects the row if this is ever empty.
      primary_muscles: [input.muscle_group],
      secondary_muscles: [],
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

/**
 * Closes a session, and deletes it instead if nothing was logged in it.
 *
 * `ended_at` is the timestamp of the LAST SET, not now. A session you forgot to
 * finish on Tuesday and closed on Thursday did not last two days, and recording
 * that it did would be a lie the app told itself. Falling back to `started_at`
 * covers a session with slots but no sets.
 */
async function closeWorkout(
  supabase: ServerClient,
  workoutId: string,
  userId: string,
): Promise<string | null> {
  const { data: slots, error: slotError } = await supabase
    .from("workout_exercises")
    .select("id")
    .eq("workout_id", workoutId);
  if (slotError) return slotError.message;

  // An abandoned session with nothing in it is not history, it is litter -- and
  // leaving it closed-but-empty would clutter the calendar with a day that
  // claims a workout happened.
  if (!slots || slots.length === 0) {
    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", userId);
    return error ? error.message : null;
  }

  const { data: last } = await supabase
    .from("workout_sets")
    .select("created_at")
    .in(
      "workout_exercise_id",
      slots.map((s) => s.id as string),
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: workout } = await supabase
    .from("workouts")
    .select("started_at")
    .eq("id", workoutId)
    .maybeSingle();

  const endedAt =
    (last?.created_at as string | undefined) ??
    (workout?.started_at as string | undefined) ??
    new Date().toISOString();

  const { error } = await supabase
    .from("workouts")
    .update({ ended_at: endedAt })
    .eq("id", workoutId)
    .eq("user_id", userId);
  return error ? error.message : null;
}

/** Closes whatever is open on a day that is not today. Null when nothing was. */
async function closeStaleWorkout(
  supabase: ServerClient,
  userId: string,
  today: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, log_date")
    .is("ended_at", null)
    .maybeSingle();
  if (error) return error.message;
  if (!data || data.log_date === today) return null;

  return closeWorkout(supabase, data.id as string, userId);
}
