import { createClient } from "@/lib/supabase/server";
import { perServingMacros, type RecipeLine } from "@/lib/recipe";
import type { Food } from "@/lib/food";
import type { RecipeRow } from "@/app/actions";
import { RecipeList, type RecipeSummary } from "@/components/recipe-list";

export const dynamic = "force-dynamic";

/**
 * The recipe shelf. Per-serving calories are computed here rather than read off
 * the generated `foods` row, because a recipe with unsaved ingredient changes
 * has a stale published row and the list should show what the dish IS, not what
 * was last published from it.
 */
export default async function RecipesPage() {
  const supabase = await createClient();

  const [{ data: recipes }, { data: ingredients }] = await Promise.all([
    supabase.from("recipes").select("*").order("created_at", { ascending: false }),
    supabase.from("recipe_ingredients").select("recipe_id, qty, food:foods(*)"),
  ]);

  const linesByRecipe = new Map<string, RecipeLine[]>();
  for (const row of ingredients ?? []) {
    const food = row.food as unknown as Food | null;
    if (!food) continue;
    const id = row.recipe_id as string;
    const list = linesByRecipe.get(id) ?? [];
    list.push({ qty: row.qty as number, food });
    linesByRecipe.set(id, list);
  }

  const summaries: RecipeSummary[] = ((recipes ?? []) as RecipeRow[]).map((recipe) => {
    const lines = linesByRecipe.get(recipe.id) ?? [];
    return {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      ingredientCount: lines.length,
      kcalPerServing: perServingMacros(lines, recipe.servings).kcal,
    };
  });

  return <RecipeList recipes={summaries} />;
}
