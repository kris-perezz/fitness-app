"use server";

/**
 * Weigh-in actions (S54-S57). A third "use server" module beside `actions.ts`
 * and `training-actions.ts`, for the reason stated at the top of that one:
 * every export in one of these files is a network endpoint, so they stay small
 * and stay grouped by domain.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { toWeighIn, type WeighIn } from "@/lib/weight";

/**
 * Record or correct the weigh-in for a day (S54, S55, S56).
 *
 * ONE action for all three stories, not three. `(user_id, log_date)` is the
 * primary key, so a date already refers to at most one thing -- which makes
 * "weigh in today", "add last Tuesday" and "fix Tuesday's typo" the same
 * question, asked of a different date. An upsert is the honest expression of
 * that; an insert that first checks for a row would be the same operation with
 * a race in it.
 *
 * This mirrors `openWorkoutOn`, deliberately: same validation, same error
 * shape, same reasons. The screens are meant to feel like one app.
 */
export async function saveWeighIn(
  date: string,
  weightLb: number,
  note?: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Not a valid date" };

  // A weight you have not stood for is not a measurement. The picker does not
  // offer future dates (S55); this is what makes that a rule rather than a
  // convention, exactly as it is on the training side.
  if (date > wakingDate()) return { error: "That day has not happened yet" };

  // Matches the column's own check. A zero is a mistyped entry every time.
  if (!Number.isFinite(weightLb) || weightLb <= 0) return { error: "Enter a weight" };

  const { error } = await supabase.from("weigh_ins").upsert(
    {
      user_id: user.id,
      log_date: date,
      // One decimal is the precision a bathroom scale has; storing more would
      // be recording noise as though it were signal.
      weight_lb: Math.round(weightLb * 10) / 10,
      note: note?.trim() ? note.trim() : null,
    },
    { onConflict: "user_id,log_date" },
  );
  if (error) return { error: error.message };

  revalidatePath("/progress", "layout");
  return { error: null };
}

/**
 * Remove a weigh-in (S56).
 *
 * A wrong weight is worse than a missing one -- the trend averages it, so one
 * bad reading distorts a week of chart in both directions. Deleting is the
 * cheap fix, which is why it sits beside editing rather than under a settings
 * screen. The confirm that guards it lives on the client, like every other
 * destructive action in the app.
 */
export async function deleteWeighIn(date: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Not a valid date" };

  const { error } = await supabase.from("weigh_ins").delete().eq("log_date", date);
  if (error) return { error: error.message };

  revalidatePath("/progress", "layout");
  return { error: null };
}

/**
 * Extend the loaded window backwards, mirroring `loadTrainingWindow`.
 *
 * The progress tab pages months in the browser for the same reason the train
 * tab does: a round trip per calendar arrow is never seamless however well it
 * is optimised. The rows are even smaller here -- one number a day -- so the
 * window is cheap enough that the only real question was whether to bound it at
 * all, and it is bounded for the same reason: an unbounded fetch is fine at one
 * year and a liability at ten.
 */
export async function loadWeighInWindow(
  fromMonth: string,
  toMonth: string,
): Promise<{ entries: WeighIn[]; error: string | null }> {
  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
    return { entries: [], error: "Bad month range" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weigh_ins")
    .select("log_date, weight_lb, note")
    .gte("log_date", `${fromMonth}-01`)
    .lte("log_date", lastDayOfMonth(toMonth))
    .order("log_date", { ascending: false });
  if (error) return { entries: [], error: error.message };

  return { entries: (data ?? []).map(toWeighIn), error: null };
}

/** Day 0 of the next month is the last day of this one, leap years included. */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Pin or unpin the one lift shown on the progress tab (S81).
 *
 * Upsert rather than update: a user who has never opened Goals has no settings
 * row yet, and pinning a lift should not be the one action that fails because
 * of that.
 *
 * `null` unpins, and is the normal state rather than an error -- Progress omits
 * the block entirely when nothing is pinned.
 */
export async function pinExercise(exerciseId: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("nutrition_settings")
    .upsert({ user_id: user.id, pinned_exercise_id: exerciseId });
  if (error) return { error: error.message };

  revalidatePath("/progress");
  revalidatePath(`/exercise/${exerciseId ?? ""}`);
  return { error: null };
}
