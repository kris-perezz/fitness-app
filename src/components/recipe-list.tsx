"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, CookingPot, Plus } from "lucide-react";
import { createRecipe, deleteRecipe } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { useSwipe } from "@/lib/swipe";
import { cn } from "@/lib/utils";
import { PAGE, SURFACE } from "@/lib/ui";

export type RecipeSummary = {
  id: string;
  name: string;
  servings: number;
  ingredientCount: number;
  kcalPerServing: number;
};

export function RecipeList({ recipes }: { recipes: RecipeSummary[] }) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [, startDelete] = useTransition();

  // The editor is still where a recipe is deleted deliberately, with its own
  // button and the same warning. This is the shortcut for the dish you opened
  // by accident and never filled in.
  function remove(recipe: RecipeSummary) {
    startDelete(async () => {
      const res = await deleteRecipe(recipe.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  // The back arrow in the header, as a gesture. Installed to a home screen
  // there is no browser edge-swipe to fall back on, so a stacked screen that
  // cannot be swiped back can only be left by aiming at the corner.
  const back = useSwipe({ onRight: () => router.push("/log") });

  return (
    <>
      <main className={cn(PAGE, "touch-pan-y")} {...back}>
        <header className="flex items-center gap-1 px-1 py-1">
          <Button size="icon-xl" variant="ghost" aria-label="Back to the log" asChild>
            <Link href="/log">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <span className="text-sm font-medium">Recipes</span>
        </header>

        {recipes.length === 0 && (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CookingPot />
              </EmptyMedia>
              <EmptyTitle>No recipes yet</EmptyTitle>
              <EmptyDescription>
                A recipe is a dish made of several foods — a pot of adobo, a tray of
                overnight oats. Say what went in and how many servings it made, and a portion
                logs as one item.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {recipes.length > 0 && (
          <Card className={SURFACE}>
            <ul>
              {recipes.map((r) => (
                <li key={r.id}>
                  <SwipeToDelete
                    title={`Delete ${r.name}?`}
                    description="The recipe and its ingredients go. Days you already logged a portion on are not touched."
                    onConfirm={() => remove(r)}
                  >
                    <Item asChild size="sm" className="rounded-none px-3.5 py-3 active:bg-accent">
                      <Link href={`/recipes/${r.id}`}>
                        <ItemContent className="min-w-0">
                          <ItemTitle className="font-normal">{r.name}</ItemTitle>
                          <ItemDescription className="text-xs">
                            {r.ingredientCount === 0
                              ? "No ingredients yet"
                              : `${r.ingredientCount} ingredient${r.ingredientCount === 1 ? "" : "s"} · ${r.servings} serving${r.servings === 1 ? "" : "s"}`}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {r.ingredientCount === 0 ? "" : `${r.kcalPerServing} cal`}
                        </ItemActions>
                      </Link>
                    </Item>
                  </SwipeToDelete>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Button variant="outline" className="h-11 w-full" onClick={() => setNaming(true)}>
          <Plus className="size-4" /> New recipe
        </Button>
      </main>

      <NewRecipeSheet open={naming} onOpenChange={setNaming} />
    </>
  );
}

/**
 * Asks for the name before creating the row. Creating first and naming later
 * would be one tap shorter and would litter the list with "Untitled recipe"
 * every time somebody opened this by accident.
 */
function NewRecipeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      // Servings defaults to 1 -- a real number, correctable on the next
      // screen, and never zero, which the schema rejects outright.
      const res = await createRecipe({ name, servings: 1, cooked_weight_g: null });
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not create that recipe");
        return;
      }
      setName("");
      onOpenChange(false);
      router.push(`/recipes/${res.id}`);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">New recipe</DrawerTitle>
          <DrawerDescription className="sr-only">Name the dish.</DrawerDescription>
        </DrawerHeader>

        <div className="px-5 pb-4">
          <Field>
            <FieldLabel htmlFor="new_recipe_name" className="text-xs font-normal text-muted-foreground">
              What is the dish called?
            </FieldLabel>
            <Input
              id="new_recipe_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() !== "" && create()}
              placeholder="Chicken adobo"
              enterKeyHint="go"
              className="h-11 text-base"
              autoFocus
            />
          </Field>
        </div>

        <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
          <Button
            className="h-11 w-full text-base"
            onClick={create}
            disabled={pending || name.trim() === ""}
          >
            {pending ? "Creating" : "Create"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
