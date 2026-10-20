import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { authUser, createClient, must } from "@/lib/supabase/server";
import { catalog, visibleFoods } from "@/lib/catalog";
import type { Food } from "@/lib/food";
import type { RecipeRow } from "@/app/actions";
import { recipeFoodId } from "@/lib/recipe";
import { RecipeEditor, type EditorLine } from "@/components/recipe-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/recipes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Recipe" };
}

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await authUser(supabase);

  const [recipe, ingredients, foods] = await Promise.all([
    // RLS scopes this to the caller, so somebody else's recipe id is a 404
    // rather than a permission error -- which is the honest answer, since as
    // far as this user is concerned the recipe does not exist.
    supabase.from("recipes").select("*").eq("id", id).maybeSingle().then(must),
    supabase
      .from("recipe_ingredients")
      .select("id, qty, food:foods(*)")
      .eq("recipe_id", id)
      .order("sort_order", { ascending: true })
      .then(must),
    catalog(supabase, user?.id ?? null).then(must),
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
    <RecipeEditor
      recipe={recipe as RecipeRow}
      lines={lines}
      foods={visibleFoods(foods ?? [], user?.id ?? null).filter((food) => food.id !== recipeFoodId(id))}
    />
  );
}
