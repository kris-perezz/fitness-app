import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Food } from "@/lib/food";
import type { RecipeRow } from "@/app/actions";
import { RecipeEditor, type EditorLine } from "@/components/recipe-editor";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: recipe }, { data: ingredients }, { data: foods }] = await Promise.all([
    // RLS scopes this to the caller, so somebody else's recipe id is a 404
    // rather than a permission error -- which is the honest answer, since as
    // far as this user is concerned the recipe does not exist.
    supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("recipe_ingredients")
      .select("id, qty, food:foods(*)")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true }),
    supabase.from("foods").select("*").order("name"),
  ]);

  if (!recipe) notFound();

  // A food can go missing under the join only if its row was deleted out from
  // under the ingredient; drop the line rather than crashing the page on it.
  const lines: EditorLine[] = (ingredients ?? [])
    .map((row) => ({
      id: row.id as string,
      qty: row.qty as number,
      food: row.food as unknown as Food,
    }))
    .filter((line) => line.food != null);

  return (
    <RecipeEditor recipe={recipe as RecipeRow} lines={lines} foods={(foods ?? []) as Food[]} />
  );
}
