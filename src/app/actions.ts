"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOffProduct, isBarcode, searchOff, type OffSearchResult } from "@/lib/off";
import { fetchCnfFood, searchCnf, type CnfSearchResult } from "@/lib/cnf";
import { extractLabel, type LabelDraft, type LabelResult } from "@/lib/label";
import { generatedFood, type RecipeDetails, type RecipeLine } from "@/lib/recipe";
import { sourceRank, type Food, type FoodSource, type Macros, type Meal } from "@/lib/food";
import type { Micros } from "@/lib/micros";

export type NewEntry = Macros & {
  /**
   * S38. Scaled at log time and stored on the row, like every other figure
   * here. Absent stays absent: a food with no iron figure writes no iron key,
   * so a day's total is over the entries that actually knew.
   */
  micros: Micros;
  sugar_g: number | null;
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
  /**
   * S60. Nullable, and the null means something specific: no goal on file. A
   * goal RATE of 0 is "maintain", which is a decision, not an absence -- so
   * these two must never be collapsed into a falsy check.
   */
  goal_weight_lb: number | null;
  goal_rate_lb_per_week: number | null;
  /**
   * S69. What weights are SHOWN in. Storage stays pounds everywhere, so this
   * never changes a stored number -- deliberately not called `weight_unit`,
   * which already means something else on `foods` (S40).
   */
  display_weight_unit: "lb" | "kg";
  /**
   * S75. The whole of the tone feature: read at render time, written nowhere
   * else. Turning it off restores calm everywhere, including for days logged
   * while it was on (S77).
   */
  strict_mode: boolean;
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
  // S69. The progress tab reads the unit and every weight on it changes.
  revalidatePath("/progress");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Plural now, not `.maybeSingle()`: since 0007 a barcode is unique per
  // creator rather than globally, so the same product can legitimately carry
  // one row per person. Which of them to believe is what the hierarchy decides.
  const { data, error } = await supabase.from("foods").select("*").eq("barcode", barcode);
  if (error) return { source: "error", food: null, error: error.message };

  const rows = (data ?? []) as (Food & { created_by: string | null })[];
  const best = bestBarcodeMatch(rows, user?.id ?? null);
  if (best) return { source: "catalog", food: best, error: null };

  const remote = await fetchOffProduct(barcode);
  if (remote.status === "error") return { source: "error", food: null, error: remote.message };
  if (remote.status === "miss") return { source: "miss", food: null, error: null };
  return { source: "remote", food: remote.food, error: null };
}

/**
 * Your own row always wins -- a correction you made to this product is the
 * whole reason you made it. Failing that, the most trustworthy source wins, and
 * a tie goes to whichever row was written last on the grounds that it saw the
 * more recent package.
 */
function bestBarcodeMatch<T extends Food & { created_by: string | null; created_at?: string }>(
  rows: T[],
  userId: string | null,
): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => {
    const mine = (r: T) => (userId !== null && r.created_by === userId ? 1 : 0);
    if (mine(row) !== mine(best)) return mine(row) > mine(best) ? row : best;
    const rank = sourceRank(row.source) - sourceRank(best.source);
    if (rank !== 0) return rank > 0 ? row : best;
    return (row.created_at ?? "") > (best.created_at ?? "") ? row : best;
  });
}

export async function saveScannedFood(food: Food) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const barcode = food.barcode ?? null;

  // Anything already sitting on this id or on this barcode is a row the lookup
  // would have found and preferred -- yours if you have one, somebody else's
  // otherwise. Either way it is the row the entry is about to point at, so
  // leave it exactly as it is and report success. Re-scanning a known product
  // is not a conflict, and overwriting it would undo a correction (S7).
  //
  // The barcode arm is scoped to the caller because uniqueness is (0007): a row
  // belonging to someone else does not stop you from keeping your own.
  const match = supabase.from("foods").select("id");
  const { data: existing, error: existingError } = await (barcode
    ? match.eq("barcode", barcode).eq("created_by", user.id)
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

// -------------------------------------------------- Canadian Nutrient File
// S91. The generic half of the catalog. OFF is barcode-indexed and therefore
// useless for a chicken breast; CNF is Health Canada's own composition data and
// has no barcodes at all, which is exactly the complementary shape.
//
// Two actions rather than one, because they are two different moments. Searching
// is free and reversible and happens while the user types; materialising writes
// a catalog row everybody else will see, and only happens once they have chosen.

export async function searchCnfFoods(query: string): Promise<CnfSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Not a data-protection measure -- CNF is public. It stops an unauthenticated
  // caller using this endpoint as a free proxy for a 471 KB fetch.
  if (!user) return { status: "error", message: "Not signed in" };

  return searchCnf(query);
}

/**
 * S96. The same door as `searchCnfFoods`, onto Open Food Facts by name.
 *
 * The auth check is doing MORE work here than it does for CNF. That one guards
 * a public dataset against being proxied for free; this one guards a shared
 * ten-requests-a-minute budget that every signed-in user draws from, because
 * the rate limit is per IP and the IP is this server's.
 */
export async function searchOffFoods(query: string): Promise<OffSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in" };

  return searchOff(query);
}

/**
 * Turn a chosen CNF row into a catalog food and hand it back.
 *
 * THE CACHED ROW IS THE CURATED CATALOG. Every deliberate choice made here
 * accumulates into `foods`, which is what makes the seed migration (S88) a
 * promotion of things that earned their place rather than a guess made up
 * front. It also means the second person to eat this food does not pay the
 * round trip.
 *
 * `created_by` is the caller, matching every other write path -- but the id is
 * the CNF food code, so two people choosing the same food collide on the
 * primary key rather than forking. That is correct here and not a bug: unlike a
 * barcode row, there is nothing person-specific to preserve. CNF said what it
 * said, and a correction is a fork under S7 like any other.
 */
export async function addCnfFood(
  code: number,
  description: string,
): Promise<{ food: Food | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { food: null, error: "Not signed in" };

  const id = `cnf_${code}`;

  // Already in the catalog: return it rather than re-fetching. This is the
  // second-person case and the re-log case, and it is the whole point of
  // caching. Its own row wins over anything CNF would say now, because a fork
  // or a correction may have happened since (S7).
  const { data: existing } = await supabase.from("foods").select("*").eq("id", id).maybeSingle();
  if (existing) return { food: existing as Food, error: null };

  const result = await fetchCnfFood(code, description);
  if (result.status === "error") return { food: null, error: result.message };
  if (result.status === "miss") {
    return { food: null, error: "Health Canada has no usable nutrition for that food." };
  }

  // Micros ride INSIDE the food now (S36), so there is nothing to add here
  // beyond the owner -- the special case this insert used to carry is gone.
  const { error } = await supabase.from("foods").insert({
    ...result.food,
    created_by: user.id,
  });
  // 23505: somebody else chose the same food first. Same outcome as finding it.
  if (error && error.code !== "23505") return { food: null, error: error.message };

  revalidatePath("/log");
  return { food: result.food, error: null };
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
    source: "label",
  };

  const { error } = await supabase.from("foods").insert({ ...food, created_by: user.id });
  if (error) return { food: null, error: error.message };

  revalidatePath("/log");
  return { food, error: null };
}

/**
 * S99. Turn an entry you typed into a food you can log again.
 *
 * THE GAP THIS CLOSES IS TOTAL. A typed one-off is terminal: the entry detail
 * offers "Edit food" only where `food_id` is set, so a dish with no label to
 * photograph and no ingredients to list -- a restaurant sandwich, a cafe drink
 * -- has to be retyped and re-derived every single time it is eaten.
 *
 * FORWARD-LOOKING ONLY, the same rule S7 states for corrections. The entry that
 * seeded this keeps its own numbers and its own `estimate` flag: it WAS typed
 * with no catalog row behind it, and relinking it afterwards would rewrite that
 * history to make a past day look better sourced than it was.
 *
 * `per_unit` on the entry's own unit, because a typed entry is written as
 * `qty 1 / unit "serving"` (add-sheet.tsx) and its macros are therefore the
 * whole portion. Nothing here converts, guesses a gram weight, or invents a
 * number the entry did not already carry.
 */
export async function saveEntryAsFood(
  entryId: string,
): Promise<{ food: Food | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { food: null, error: "Not signed in" };

  // Scoped to the user as well as the id, matching updateRecipe and
  // deleteRecipe: a wrong id fails as "not found" rather than reaching for
  // somebody else's row and relying on RLS to say no.
  const { data, error } = await supabase
    .from("intake_entries")
    .select("*")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { food: null, error: error.message };
  if (!data) return { food: null, error: "Entry not found" };

  const entry = data as {
    name: string;
    unit: string;
    food_id: string | null;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carb_g: number;
    fiber_g: number;
    sodium_mg: number | null;
    sugar_g: number | null;
    micros: Micros | null;
  };

  // Already a catalog food. Not an error the user can act on, and offering the
  // button at all in that case is the caller's bug rather than theirs.
  if (entry.food_id !== null) {
    return { food: null, error: "That entry already came from a food." };
  }

  const name = entry.name.trim();
  if (!name) return { food: null, error: "That entry has no name to save." };

  const food: Food = {
    id: `manual_${crypto.randomUUID()}`,
    name,
    aliases: [],
    basis: "per_unit",
    unit: entry.unit,
    grams_per_unit: null,
    // On per_unit the measure is only meaningful alongside a gram weight, and
    // there is none. "g" is the column's default rather than a claim.
    weight_unit: "g",
    kcal: entry.kcal,
    protein_g: entry.protein_g,
    fat_g: entry.fat_g,
    carb_g: entry.carb_g,
    fiber_g: entry.fiber_g,
    sodium_mg: entry.sodium_mg,
    sugar_g: entry.sugar_g,
    // Absent stays absent (S36): a typed entry carries `{}` and copying that
    // is right, where filling in zeroes would invent a claim.
    micros: entry.micros ?? {},
    // Nobody transcribed a package here -- the numbers came out of the same
    // head that typed the name.
    verified: false,
    source: "manual",
    barcode: null,
  };

  const { error: insertError } = await supabase
    .from("foods")
    .insert({ ...food, created_by: user.id });
  if (insertError) return { food: null, error: insertError.message };

  revalidatePath("/log");
  return { food, error: null };
}

// ------------------------------------------------------------- corrections
// S7. Open Food Facts has the US Premier Protein shake at 230 mg sodium; the
// Canadian packet says 250. Fixing that is a forward-looking edit and only ever
// a forward-looking edit -- intake_entries denormalises macros at log time, so
// every portion already logged keeps exactly what it was logged with, and the
// UI says so rather than leaving the user to wonder.

/** The fields a person can correct. Basis and unit are not among them: changing
 * what the numbers are quoted against would silently rescale the food. */
export type FoodEdit = {
  name: string;
  grams_per_unit: number | null;
  /** What `grams_per_unit` is measured in (S40). Editable because it was
   * backfilled by inspection in 0008 and can therefore be wrong. */
  weight_unit: "g" | "ml";
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number | null;
};

/**
 * Update in place when the row is yours, fork it when it is not.
 *
 * Both paths end with a row you own carrying your numbers; the difference is
 * only whether anybody else was relying on the old one. The seed set has no
 * creator at all, so every correction to it forks.
 */
export async function updateFood(
  id: string,
  edit: FoodEdit,
): Promise<{ food: Food | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { food: null, error: "Not signed in" };

  const invalid = validateEdit(edit);
  if (invalid) return { food: null, error: invalid };

  const { data, error } = await supabase.from("foods").select("*").eq("id", id).maybeSingle();
  if (error) return { food: null, error: error.message };
  if (!data) return { food: null, error: "Food not found" };

  const current = data as Food & { created_by: string | null };

  // A recipe's foods row is generated output -- editing it here would be undone
  // by the next save. The recipe itself is the thing to change (S19).
  if (current.source === "recipe") {
    return { food: null, error: "Edit the recipe instead -- saving it rewrites these numbers." };
  }

  const source: FoodSource = current.source === "label" ? "label" : "manual";

  // S97. What the row descended from, kept because `source` no longer says it.
  // A second correction must not rewrite this to `manual` and lose the original
  // ancestry, so an already-forked row carries its own answer forward. A label
  // row keeps its source and therefore needs no ancestry at all.
  const derivedFrom: FoodSource | null =
    source === "label"
      ? null
      : current.source === "manual"
        ? (current.derived_from ?? null)
        : current.source;

  const fields = {
    name: edit.name.trim(),
    grams_per_unit: edit.grams_per_unit,
    // On a per_100g basis the measure IS the unit (0008), so accepting a
    // conflicting value here would break that rule from the outside.
    weight_unit: current.basis === "per_100g" ? current.unit : edit.weight_unit,
    kcal: edit.kcal,
    protein_g: edit.protein_g,
    carb_g: edit.carb_g,
    fat_g: edit.fat_g,
    fiber_g: edit.fiber_g,
    sodium_mg: edit.sodium_mg,
    // A label row stays a label row: correcting a misread digit does not change
    // where the numbers came from. Anything else becomes `manual`, because
    // after this they are no longer the database's numbers -- they are yours,
    // and the hierarchy ranks them above Open Food Facts accordingly.
    source,
    // ...but where they STARTED still matters, and for a CNF row it is a
    // licence obligation rather than a nicety (S97, 0028).
    derived_from: derivedFrom,
    // Somebody has now checked these against a package, which is what the
    // column has meant since 0001.
    verified: true,
  };

  if (current.created_by === user.id) {
    const { data: updated, error: updateError } = await supabase
      .from("foods")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) return { food: null, error: updateError.message };

    revalidatePath("/log");
    return { food: updated as Food, error: null };
  }

  // Fork. The barcode comes along -- per-owner uniqueness (0007) is what makes
  // that legal -- so the next scan of this product finds your row first.
  const fork = {
    ...current,
    ...fields,
    id: `food_${crypto.randomUUID()}`,
    aliases: current.aliases,
    created_by: user.id,
    created_at: undefined,
    supersedes: current.id,
  };
  delete (fork as { created_at?: unknown }).created_at;

  const { data: inserted, error: insertError } = await supabase
    .from("foods")
    .insert(fork)
    .select("*")
    .single();
  if (insertError) return { food: null, error: insertError.message };

  revalidatePath("/log");
  return { food: inserted as Food, error: null };
}

function validateEdit(edit: FoodEdit): string | null {
  if (!edit.name.trim()) return "Name is required";
  if (edit.weight_unit !== "g" && edit.weight_unit !== "ml") return "Measure must be g or ml";
  const numbers: (number | null)[] = [
    edit.grams_per_unit,
    edit.kcal,
    edit.protein_g,
    edit.carb_g,
    edit.fat_g,
    edit.fiber_g,
    edit.sodium_mg,
  ];
  for (const n of numbers) {
    if (n === null) continue;
    if (!Number.isFinite(n) || n < 0) return "Every number has to be zero or more";
  }
  if (edit.grams_per_unit !== null && edit.grams_per_unit <= 0) {
    // Absent is fine (an unknown serving size is unknown); zero is a typo.
    return "Serving size must be greater than zero, or left blank";
  }
  return null;
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
