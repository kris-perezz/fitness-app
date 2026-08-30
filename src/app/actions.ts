"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Macros } from "@/lib/food";

export type NewEntry = Macros & {
  log_date: string;
  food_id: string | null;
  name: string;
  qty: number;
  unit: string;
  estimate: boolean;
};

export async function addEntry(entry: NewEntry) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("intake_entries").insert({ ...entry, user_id: user.id });
  if (error) return { error: error.message };

  revalidatePath("/log");
  return { error: null };
}

export async function deleteEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("intake_entries").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/log");
  return { error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type TargetsInput = {
  phase_label: string | null;
  cal_daily_equiv: number;
  protein_floor_g: number;
  protein_stretch_g: number | null;
  fat_floor_g: number;
};

export async function saveTargets(targets: TargetsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("nutrition_settings")
    .upsert({ ...targets, user_id: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };

  revalidatePath("/log");
  revalidatePath("/targets");
  return { error: null };
}
