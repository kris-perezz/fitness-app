"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, Trash2, TriangleAlert } from "lucide-react";
import { show, type Food } from "@/lib/food";
import {
  totalMacros,
  perServingMacros,
  rawInputWeight,
  yieldCheck,
  type RecipeLine,
} from "@/lib/recipe";
import {
  deleteRecipe,
  removeRecipeIngredient,
  saveRecipe,
  updateRecipeIngredient,
  type RecipeRow,
} from "@/app/actions";
import { IngredientSheet } from "@/components/ingredient-sheet";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

/** An ingredient row joined to its food, which is what the maths needs. */
export type EditorLine = RecipeLine & { id: string };

const round = (v: number) => Math.round(v);

/**
 * S15-S17 and S21 on one screen.
 *
 * Totals recompute locally on every keystroke because they are the feedback
 * that makes the form worth filling in -- a server round trip per character
 * would make the running total useless. Nothing here is trusted, though: on
 * save the server recomputes the published food from its own read of the
 * ingredients (see saveRecipe), so what the browser shows can only ever be
 * wrong on screen, never wrong in the database.
 */
export function RecipeEditor({
  recipe,
  lines,
  foods,
}: {
  recipe: RecipeRow;
  lines: EditorLine[];
  foods: Food[];
}) {
  const router = useRouter();
  const [name, setName] = useState(recipe.name);
  const [servings, setServings] = useState(String(recipe.servings));
  const [cooked, setCooked] = useState(
    recipe.cooked_weight_g === null ? "" : String(recipe.cooked_weight_g),
  );
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const servingCount = Number(servings);
  const cookedWeight = cooked.trim() === "" ? null : Number(cooked);

  const total = totalMacros(lines);
  const per = perServingMacros(lines, servingCount);
  const raw = rawInputWeight(lines);

  // S21. Only computable with both a cooked weight and a raw weight, and the
  // two ways it can be missing are different problems with different fixes --
  // hence rawInputWeight's discriminated result rather than a nullable number.
  const check =
    cookedWeight !== null && cookedWeight > 0 && raw.known
      ? yieldCheck(cookedWeight, raw.grams)
      : null;

  function save() {
    startTransition(async () => {
      const res = await saveRecipe(recipe.id, {
        name,
        servings: servingCount,
        cooked_weight_g: cookedWeight,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Recipe saved");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteRecipe(recipe.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.push("/recipes");
    });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-1 border-b border-border px-2 py-2">
          <Button size="icon" variant="ghost" aria-label="All recipes" asChild>
            <Link href="/recipes">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <span className="truncate text-sm font-medium">{name || "Untitled recipe"}</span>
        </header>

        <section className="border-b border-border px-5 py-5">
          <Field>
            <FieldLabel htmlFor="recipe_name" className="text-xs font-normal text-muted-foreground">
              Name
            </FieldLabel>
            <Input
              id="recipe_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chicken adobo"
              className="h-11 text-base"
            />
          </Field>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel
                htmlFor="recipe_servings"
                className="text-xs font-normal text-muted-foreground"
              >
                Servings
              </FieldLabel>
              <Input
                id="recipe_servings"
                type="number"
                inputMode="decimal"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="h-11 text-base tabular-nums"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="recipe_cooked"
                className="text-xs font-normal text-muted-foreground"
              >
                Cooked weight (g)
              </FieldLabel>
              <Input
                id="recipe_cooked"
                type="number"
                inputMode="decimal"
                value={cooked}
                onChange={(e) => setCooked(e.target.value)}
                // S17 is explicitly optional, so the placeholder says so rather
                // than showing a 0 that would read as a weighed answer.
                placeholder="Optional"
                className="h-11 text-base tabular-nums"
              />
            </Field>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Servings split the macros exactly: water lost in cooking carries no calories, so
            one portion is one portion&rsquo;s share whatever the pot weighs. A cooked weight
            is only needed to log an odd-sized portion by grams.
          </p>
        </section>

        <section className="border-b border-border px-5 py-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Calories", per.kcal],
              ["Protein", per.protein_g],
              ["Carbs", per.carb_g],
              ["Fat", per.fat_g],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="text-lg tabular-nums">{value}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            per serving · whole dish {round(total.kcal).toLocaleString()} cal
            {raw.known && raw.grams > 0 ? ` · ${round(raw.grams)} g in` : ""}
          </p>
        </section>

        {check && check.verdict !== "plausible" && (
          <section className="border-b border-border px-5 py-4">
            {/* S21 is advisory and never blocks a save -- real cooks do reduce a
                stew hard. It is a prompt to look, so it says what to look at. */}
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>
                {check.verdict === "low"
                  ? `Only ${Math.round(check.ratio * 100)}% of what went in came out`
                  : `More came out (${Math.round(check.ratio * 100)}%) than went in`}
              </AlertTitle>
              <AlertDescription>
                {check.verdict === "low"
                  ? "That is more loss than simmering explains. Check for an over-stated ingredient quantity."
                  : "Something is missing or under-stated. Check for an ingredient you did not add."}{" "}
                Saving is fine either way.
              </AlertDescription>
            </Alert>
          </section>
        )}

        {cookedWeight !== null && cookedWeight > 0 && !raw.known && (
          <section className="border-b border-border px-5 py-4">
            <Alert>
              <TriangleAlert />
              <AlertTitle>Cannot check the yield</AlertTitle>
              <AlertDescription>
                No weight is recorded for {raw.missing.join(", ")}, so what went in cannot be
                totalled. Fill in the serving weight on those foods to enable the check.
              </AlertDescription>
            </Alert>
          </section>
        )}

        <section className="border-b border-border">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-sm font-semibold">Ingredients</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{lines.length}</span>
          </div>

          {lines.length === 0 && (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plus />
                </EmptyMedia>
                <EmptyTitle>Nothing in the pot yet</EmptyTitle>
                <EmptyDescription>
                  Add ingredients by search, barcode or label — the same way you add food to a
                  day.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {lines.length > 0 && (
            <ul>
              {lines.map((line) => (
                <IngredientRow key={line.id} line={line} onChanged={() => router.refresh()} />
              ))}
            </ul>
          )}

          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 px-5 py-3 text-left text-sm font-medium text-primary transition-colors active:bg-accent"
          >
            <Plus className="size-4" /> Add ingredient
          </button>
        </section>

        <section className="px-5 py-5">
          <ButtonGroup className="w-full">
            <Button
              className="h-11 flex-1 text-base"
              onClick={save}
              disabled={pending || name.trim() === "" || lines.length === 0}
            >
              {pending ? "Saving" : "Save recipe"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 text-destructive"
              aria-label="Delete recipe"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </ButtonGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            Saving publishes this dish as a food, so a portion is logged like anything else.
            Portions already logged keep the numbers they were logged with.
          </p>
        </section>
      </main>

      <IngredientSheet
        recipeId={recipe.id}
        foods={foods}
        open={adding}
        onOpenChange={setAdding}
        onAdded={() => router.refresh()}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {recipe.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The recipe and its ingredients go. Days you already logged a portion on are not
              touched, and the dish stays in your food list so those entries keep their name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * One ingredient. The quantity is editable in place: correcting "500" to "50"
 * is the commonest edit there is, and sending it through a sheet for one number
 * would be slower than re-adding the food.
 */
function IngredientRow({ line, onChanged }: { line: EditorLine; onChanged: () => void }) {
  const [qty, setQty] = useState(String(line.qty));
  const [pending, startTransition] = useTransition();

  const macros = totalMacros([line]);
  // Reads the same either way: a per_100g food's unit IS g or ml, and a
  // per_unit food's is the thing being counted (open decision 3).
  const unit = line.food.unit;

  function commit() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setQty(String(line.qty));
      return;
    }
    if (n === line.qty) return;

    startTransition(async () => {
      const res = await updateRecipeIngredient(line.id, n);
      if (res.error) {
        toast.error(res.error);
        setQty(String(line.qty));
        return;
      }
      onChanged();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeRecipeIngredient(line.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <li>
      <Item size="sm" className="rounded-none px-5 py-2.5">
        <ItemContent className="min-w-0">
          <ItemTitle className="font-normal">{line.food.name}</ItemTitle>
          <ItemDescription className="text-xs">
            {show(macros.kcal)} cal · {show(macros.protein_g)}g protein
          </ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0 gap-1">
          <Input
            type="number"
            inputMode="decimal"
            aria-label={`Amount of ${line.food.name}`}
            value={qty}
            disabled={pending}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-9 w-16 text-base tabular-nums"
          />
          <span className="w-8 shrink-0 text-xs text-muted-foreground">{unit}</span>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            aria-label={`Remove ${line.food.name}`}
            disabled={pending}
            onClick={remove}
          >
            <Trash2 className="size-4" />
          </Button>
        </ItemActions>
      </Item>
    </li>
  );
}
