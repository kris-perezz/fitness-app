"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOffProduct, isBarcode } from "@/lib/off";
import { extractLabel, type LabelDraft, type LabelResult } from "@/lib/label";
import { generatedFood, type RecipeDetails, type RecipeLine } from "@/lib/recipe";
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

// ------------------------------------------------------------ label photos
// S4/S5. The provider lives entirely in lib/label.ts; this action exists so the
// key never reaches the browser and so an unauthenticated caller cannot spend
// it. Extraction produces a DRAFT -- nothing is written until the user has
// looked at every field and confirmed it (readLabel does not touch the
// database at all).

export async function readLabel(image: string): Promise<LabelResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in" };

  return extractLabel(image);
}

/**
 * Write a confirmed label draft to the catalog and hand back the saved food, so
 * the caller can drop straight into the existing quantity step.
 *
 * `verified` is true here and only here: it means "transcribed from a label",
 * which is what puts this row above an Open Food Facts guess in the source
 * hierarchy. A barcode is carried through when the label was reached from a
 * scan that missed, so the next scan of the same product finds this row first.
 */
export async function saveLabelFood(
  draft: LabelDraft,
  barcode: string | null,
): Promise<{ food: Food | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { food: null, error: "Not signed in" };

  const food: Food = {
    ...draft,
    id: `label_${crypto.randomUUID()}`,
    aliases: [],
    barcode,
    verified: true,
  };

  const { error } = await supabase.from("foods").insert({ ...food, created_by: user.id });
  if (error) return { food: null, error: error.message };

  revalidatePath("/log");
  return { food, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ------------------------------------------------------------------ recipes
// A recipe is a saved definition, editable indefinitely (S15). Saving it
// publishes an ordinary `foods` row so logging a portion needs no new logging
// code (S16). Editing regenerates that row for FUTURE logs only: past entries
// keep the macros `intake_entries` denormalised at log time, so nothing here
// ever writes back to `intake_entries` (S19, same rule as S7).

export type RecipeRow = {
  id: string;
  name: string;
  servings: number;
  cooked_weight_g: number | null;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  food_id: string;
  /** COUNT for per_unit foods, GRAMS for per_100g foods -- as `scale()` reads it. */
  qty: number;
  sort_order: number;
};

/**
 * Unlike the other actions this returns an id alongside `error`: the caller has
 * just created a row it has no other way to address, and the ingredient actions
 * all need it.
 */
export async function createRecipe(
  details: RecipeDetails,
): Promise<{ error: string | null; id: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", id: null };

  const invalid = validateDetails(details);
  if (invalid) return { error: invalid, id: null };

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      user_id: user.id,
      name: details.name.trim(),
      servings: details.servings,
      cooked_weight_g: details.cooked_weight_g,
    })
    .select("id")
    .single();
  if (error) return { error: error.message, id: null };

  revalidatePath("/recipes");
  return { error: null, id: data.id as string };
}

/** Name / servings / cooked weight only; ingredients have their own actions. */
export async function updateRecipe(id: string, details: RecipeDetails) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const invalid = validateDetails(details);
  if (invalid) return { error: invalid };

  // RLS already scopes this to the caller; the explicit user_id filter means a
  // wrong id fails as "not found" rather than silently updating nothing.
  const { error } = await supabase
    .from("recipes")
    .update({
      name: details.name.trim(),
      servings: details.servings,
      cooked_weight_g: details.cooked_weight_g,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  return { error: null };
}

/**
 * Deletes the recipe and, by cascade, its ingredients. The generated `foods`
 * row is deliberately left behind: `intake_entries.food_id` points at it, and
 * past entries are not ours to disturb (S19).
 */
export async function deleteRecipe(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("recipes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  return { error: null };
}

export async function addRecipeIngredient(recipeId: string, foodId: string, qty: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be greater than zero" };

  const owned = await ownsRecipe(supabase, recipeId, user.id);
  if (owned) return { error: owned };

  // Append to the end of the list: ingredients read in the order entered (S15).
  const { data: last, error: lastError } = await supabase
    .from("recipe_ingredients")
    .select("sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { error: lastError.message };

  const { error } = await supabase.from("recipe_ingredients").insert({
    recipe_id: recipeId,
    food_id: foodId,
    qty,
    sort_order: last ? (last.sort_order as number) + 1 : 0,
  });
  if (error) return { error: error.message };

  await touchRecipe(supabase, recipeId, user.id);
  revalidatePath("/recipes");
  return { error: null };
}

export async function updateRecipeIngredient(id: string, qty: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be greater than zero" };

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .update({ qty })
    .eq("id", id)
    .select("recipe_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Ingredient not found" };

  await touchRecipe(supabase, data.recipe_id as string, user.id);
  revalidatePath("/recipes");
  return { error: null };
}

export async function removeRecipeIngredient(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("id", id)
    .select("recipe_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Ingredient not found" };

  await touchRecipe(supabase, data.recipe_id as string, user.id);
  revalidatePath("/recipes");
  return { error: null };
}

/**
 * Save: store the details, then publish the recipe's `foods` row from a fresh
 * server-side read of the ingredients (S16). The client sends an id and the
 * fields the user typed; the macros are computed here from trusted rows, never
 * accepted from the browser.
 */
export async function saveRecipe(id: string, details: RecipeDetails) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const detailsError = await updateRecipe(id, details);
  if (detailsError.error) return detailsError;

  const owned = await ownsRecipe(supabase, id, user.id);
  if (owned) return { error: owned };

  const { data: rows, error: linesError } = await supabase
    .from("recipe_ingredients")
    .select("qty, food:foods(*)")
    .eq("recipe_id", id)
    .order("sort_order", { ascending: true });
  if (linesError) return { error: linesError.message };

  const lines: RecipeLine[] = (rows ?? [])
    .map((row) => ({ qty: row.qty as number, food: row.food as unknown as Food }))
    .filter((line) => line.food != null);
  if (lines.length === 0) return { error: "Add at least one ingredient first" };

  const food = generatedFood(id, { ...details, name: details.name.trim() }, lines);

  // Upsert, not insert: re-saving an edited recipe must land on the same row so
  // future logs pick up the new macros while logged entries keep their own.
  const { error } = await supabase
    .from("foods")
    .upsert({ ...food, created_by: user.id }, { onConflict: "id" });
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath("/log");
  return { error: null };
}

// ------------------------------------------------------------ recipe helpers

function validateDetails(details: RecipeDetails): string | null {
  if (!details.name.trim()) return "Name is required";
  if (!Number.isFinite(details.servings) || details.servings <= 0) {
    return "Servings must be greater than zero";
  }
  if (
    details.cooked_weight_g != null &&
    (!Number.isFinite(details.cooked_weight_g) || details.cooked_weight_g <= 0)
  ) {
    // S17 makes the weight optional, so "absent" is fine -- "zero" is a typo.
    return "Cooked weight must be greater than zero, or left blank";
  }
  return null;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Null when the caller owns the recipe, an error string otherwise. */
async function ownsRecipe(
  supabase: ServerClient,
  recipeId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Recipe not found";
  return null;
}

/**
 * Bump `updated_at` after an ingredient change. Best-effort: a failed timestamp
 * is not worth failing an otherwise-successful edit over.
 */
async function touchRecipe(supabase: ServerClient, recipeId: string, userId: string) {
  await supabase
    .from("recipes")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", recipeId)
    .eq("user_id", userId);
}
