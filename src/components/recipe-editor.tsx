"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Plus, Trash2, TriangleAlert } from "lucide-react";
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
  duplicateRecipe,
  removeRecipeIngredient,
  saveRecipe,
  updateRecipe,
  updateRecipeIngredient,
  type RecipeRow,
} from "@/app/actions";
import { reach } from "@/lib/reach";
import { IngredientSheet } from "@/components/ingredient-sheet";
import { ConfirmAction } from "@/components/confirm-action";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { useSwipe } from "@/lib/swipe";
import { useBack } from "@/lib/back";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { PAGE, SURFACE, SURFACE_PAD } from "@/lib/ui";

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

  // What the server last accepted, so leaving or copying can save the rest.
  const [saved, setSaved] = useState({ name, servings, cooked });
  const dirty = name !== saved.name || servings !== saved.servings || cooked !== saved.cooked;

  /**
   * True when nothing is left unsaved. `discard` puts a way out on the error,
   * so a draft the server rejects cannot trap you on the screen.
   */
  async function persist(discard?: () => void): Promise<boolean> {
    if (!dirty) return true;
    const details = { name, servings: servingCount, cooked_weight_g: cookedWeight };
    // An empty pot has nothing to publish yet, but its name still keeps.
    const res = await reach(
      lines.length > 0 ? saveRecipe(recipe.id, details) : updateRecipe(recipe.id, details),
    );
    if (res.error) {
      toast.error(res.error, discard && { action: { label: "Discard edits", onClick: discard } });
      return false;
    }
    setSaved({ name, servings, cooked });
    return true;
  }

  function save() {
    startTransition(async () => {
      if (await persist()) toast.success("Saved recipe");
    });
  }

  // The copy opens straight away: a variation is started in order to change
  // something, so leaving the user on the original would cost a tap and invite
  // editing the wrong one.
  function duplicate() {
    startTransition(async () => {
      if (!(await persist())) return;
      const res = await reach(duplicateRecipe(recipe.id));
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not copy that recipe");
        return;
      }
      router.push(`/recipes/${res.id}`);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await reach(deleteRecipe(recipe.id));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.replace("/recipes");
    });
  }

  // The back arrow in the header, as a gesture. Installed to a home screen
  // there is no browser edge-swipe to fall back on, so a stacked screen that
  // cannot be swiped back can only be left by aiming at the corner.
  const leave = useBack("/recipes");
  const goBack = () =>
    startTransition(async () => {
      if (await persist(leave)) leave();
    });
  const back = useSwipe({ onRight: goBack });

  return (
    <>
      <main className={cn(PAGE, "touch-pan-y")} {...back}>
        <header className="flex items-center gap-1 px-1 py-1">
          <Button size="icon-xl" variant="ghost" aria-label="All recipes" onClick={goBack}>
            <ChevronLeft className="size-5" />
          </Button>
          <h1 className="truncate text-sm font-medium">{name || "Untitled recipe"}</h1>
        </header>

        <Card className={cn(SURFACE, SURFACE_PAD)}>
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
                type="text"
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
                type="text"
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
            Add a cooked weight to log portions by grams.
          </p>
        </Card>

        <Card className={cn(SURFACE, SURFACE_PAD)}>
          {/* Hand-rolled: Chart is the only registry option for a figure and it
              would pull recharts in to render four numbers. */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Calories", per.kcal.toLocaleString()],
              ["Protein", `${per.protein_g} g`],
              ["Carbs", `${per.carb_g} g`],
              ["Fat", `${per.fat_g} g`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-lg tabular-nums">{value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Per serving
            {cookedWeight !== null && cookedWeight > 0 && servingCount > 0
              ? ` (about ${round(cookedWeight / servingCount)} g)`
              : ""}
            {" "}· fibre {per.fiber_g} g · sodium {per.sodium_mg.toLocaleString()} mg
          </p>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            Whole dish {round(total.kcal).toLocaleString()} cal
            {/* The raw weight is only ever read against the cooked one, so
                without a cooked weight it is a number with nothing to say. */}
            {check && raw.known ? ` · ${round(raw.grams)} g raw` : ""}
          </p>
        </Card>

        {check && check.verdict !== "plausible" && (
          // S21 is advisory and never blocks a save -- real cooks do reduce a
          // stew hard. It is a prompt to look, so it says what to look at.
          // Alert brings its own surface, so it takes the page directly.
          <Alert>
            <TriangleAlert />
            <AlertTitle>
              {check.verdict === "low"
                ? `Only ${Math.round(check.ratio * 100)}% of what went in came out`
                : `The dish weighs ${Math.round(check.ratio * 100)}% of what went in`}
            </AlertTitle>
            <AlertDescription>
              {check.verdict === "low"
                ? "More loss than simmering explains. Check for an amount typed too high."
                : "Normal when rice, pasta or beans soak up water. Otherwise, check for a missing ingredient."}
            </AlertDescription>
          </Alert>
        )}

        {cookedWeight !== null && cookedWeight > 0 && !raw.known && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Cannot check the yield</AlertTitle>
            <AlertDescription>
              No weight is recorded for {raw.missing.join(", ")}, so what went in cannot be
              totalled. Fill in the serving weight on those foods to enable the check.
            </AlertDescription>
          </Alert>
        )}

        <Card className={SURFACE}>
          <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
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
            // A real <ul>, not ItemGroup: ItemGroup is a div with role="list"
            // that spaces children with a gap, and these rows are flush.
            <ul>
              {lines.map((line) => (
                <IngredientRow key={line.id} line={line} />
              ))}
            </ul>
          )}

          <div className="px-3.5 pb-4 pt-1">
            <Button variant="outline" className="h-11 w-full" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add ingredient
            </Button>
          </div>
        </Card>

        <div>
          <ButtonGroup className="w-full">
            <Button
              className="h-11 flex-1 text-base"
              onClick={save}
              disabled={pending || !dirty || name.trim() === ""}
            >
              {pending ? "Saving" : dirty ? "Save changes" : "Saved"}
            </Button>
            <Button
              size="icon-xl"
              variant="outline"
              aria-label="Duplicate recipe"
              disabled={pending}
              onClick={duplicate}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              size="icon-xl"
              variant="destructive"
              aria-label="Delete recipe"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </ButtonGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            This dish is logged like any food. Portions already logged keep their numbers.
          </p>
        </div>
      </main>

      <IngredientSheet
        recipeId={recipe.id}
        foods={foods}
        open={adding}
        onOpenChange={setAdding}
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
function IngredientRow({ line }: { line: EditorLine }) {
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
      const res = await reach(updateRecipeIngredient(line.id, n));
      if (res.error) {
        toast.error(res.error);
        setQty(String(line.qty));
        return;
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await reach(removeRecipeIngredient(line.id));
      if (res.error) {
        toast.error(res.error);
        return;
      }
    });
  }

  return (
    <li>
      {/* The Trash button on the right stays exactly where it was; this is the
          gesture path to the same question. */}
      <SwipeToDelete
        title={`Remove ${line.food.name}?`}
        description="It comes out of the recipe's totals. Portions already logged keep the numbers they were logged with."
        confirmLabel="Remove"
        onConfirm={remove}
        disabled={pending}
      >
        <Item size="sm" className="rounded-none px-3.5 py-2.5">
          <ItemContent className="min-w-0">
            <ItemTitle className="line-clamp-2 font-normal whitespace-normal">{line.food.name}</ItemTitle>
            <ItemDescription className="text-xs">
              {round(macros.kcal).toLocaleString()} cal · {show(macros.protein_g)} g protein
            </ItemDescription>
          </ItemContent>
          <ItemActions className="shrink-0 gap-1">
            <Input
              type="text"
              inputMode="decimal"
              aria-label={`Amount of ${line.food.name}`}
              value={qty}
              disabled={pending}
              onChange={(e) => setQty(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 w-16 text-base tabular-nums"
            />
            <span className="max-w-12 shrink-0 truncate text-xs text-muted-foreground">{unit}</span>
            <ConfirmAction
              title={`Remove ${line.food.name}?`}
              description="It comes out of the recipe's totals. Portions already logged keep the numbers they were logged with."
              confirmLabel="Remove"
              onConfirm={remove}
              trigger={
                <Button
                  size="icon-xl"
                  variant="ghost"
                  className="text-muted-foreground"
                  aria-label={`Remove ${line.food.name}`}
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          </ItemActions>
        </Item>
      </SwipeToDelete>
    </li>
  );
}
