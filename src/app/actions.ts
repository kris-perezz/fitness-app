"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOffProduct, isBarcode } from "@/lib/off";
import type { Food, Macros, Meal } from "@/lib/food";

export type NewEntry = Macros & {
  log_date: string;
  meal: Meal;
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

export type Goals = {
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
};

export async function saveGoals(goals: Goals) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("nutrition_settings")
    .upsert({ ...goals, user_id: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };

  revalidatePath("/log");
  revalidatePath("/goals");
  return { error: null };
}

export type BarcodeResult =
  | { source: "catalog" | "remote"; food: Food; error: null }
  | { source: "miss"; food: null; error: null }
  | { source: "error"; food: null; error: string };

/** Local catalog first, Open Food Facts second. Never throws to the caller. */
export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  const barcode = code.trim();
  if (!isBarcode(barcode)) return { source: "error", food: null, error: "Not a valid barcode" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();
  if (error) return { source: "error", food: null, error: error.message };
  if (data) return { source: "catalog", food: data as Food, error: null };

  const remote = await fetchOffProduct(barcode);
  if (remote.status === "error") return { source: "error", food: null, error: remote.message };
  if (remote.status === "miss") return { source: "miss", food: null, error: null };
  return { source: "remote", food: remote.food, error: null };
}

export async function saveScannedFood(food: Food) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const barcode = food.barcode ?? null;

  // A row already sitting on this barcode is somebody's correction, and a
  // correction outranks whatever the remote database says -- so leave it alone
  // and report success. Re-scanning a known product is not a conflict.
  const match = supabase.from("foods").select("id");
  const { data: existing, error: existingError } = await (barcode
    ? match.eq("barcode", barcode)
    : match.eq("id", food.id)
  ).maybeSingle();
  if (existingError) return { error: existingError.message };
  if (existing) return { error: null };

  const { error } = await supabase.from("foods").insert({
    ...food,
    barcode,
    created_by: user.id,
  });
  // 23505: a concurrent scan inserted it first. Same outcome as finding it above.
  if (error && error.code !== "23505") return { error: error.message };

  revalidatePath("/log");
  return { error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
