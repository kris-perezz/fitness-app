"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CookingPot, Pencil, Plus } from "lucide-react";
import { MEALS, shiftDate, wakingDate, type Food, type Meal } from "@/lib/food";
import { deleteEntry } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { AddSheet } from "@/components/add-sheet";
import { ConfirmAction } from "@/components/confirm-action";
import { EditFoodSheet } from "@/components/edit-food-sheet";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { CalorieRing } from "@/components/calorie-ring";
import { toast } from "sonner";

type Entry = {
  id: string;
  /** Null for a one-off typed straight into the log -- there is no catalog row
   * behind it, so there is nothing to correct (S7). */
  food_id: string | null;
  name: string;
  meal: Meal;
  qty: number;
  unit: string;
  estimate: boolean;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  fiber_g: number;
  sodium_mg: number;
};

type Goals = {
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
} | null;

const round = (v: number) => Math.round(v);
const withCommas = (v: number) => round(v).toLocaleString();

export function LogScreen({
  date,
  foods,
  entries,
  goals,
}: {
  date: string;
  foods: Food[];
  entries: Entry[];
  goals: Goals;
}) {
  const router = useRouter();
  const [addingTo, setAddingTo] = useState<Meal | null>(null);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Food | null>(null);

  const totals = entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal,
      protein_g: a.protein_g + e.protein_g,
      fat_g: a.fat_g + e.fat_g,
      carb_g: a.carb_g + e.carb_g,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 },
  );

  const calorieGoal = goals?.calorie_goal ?? 2000;

  const today = wakingDate();
  const label =
    date === today
      ? "Today"
      : date === shiftDate(today, -1)
        ? "Yesterday"
        : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between border-b border-border px-2 py-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous day"
            onClick={() => router.push(`/log?date=${shiftDate(date, -1)}`)}
          >
            <ChevronLeft className="size-5" />
          </Button>

          <span className="text-sm font-medium">{label}</span>

          <div className="flex items-center">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => router.push(`/log?date=${shiftDate(date, 1)}`)}
            >
              <ChevronRight className="size-5" />
            </Button>
            {/* Recipes are a Food-section destination with no tab of its own
                (see bottom-nav.tsx), so this header is the way in. It sits
                after the day arrows because it is not part of them. */}
            <Button size="icon" variant="ghost" aria-label="Recipes" asChild>
              <Link href="/recipes">
                <CookingPot className="size-5" />
              </Link>
            </Button>
          </div>
        </header>

        <section className="border-b border-border px-5 py-6">
          <CalorieRing consumed={totals.kcal} goal={calorieGoal} />

          <div className="mt-6 grid grid-cols-3 gap-4">
            <MacroMeter
              label="Protein"
              value={totals.protein_g}
              goal={goals?.protein_goal_g ?? null}
            />
            <MacroMeter label="Carbs" value={totals.carb_g} goal={goals?.carb_goal_g ?? null} />
            <MacroMeter label="Fat" value={totals.fat_g} goal={goals?.fat_goal_g ?? null} />
          </div>
        </section>

        {MEALS.map((meal) => {
          const items = entries.filter((e) => e.meal === meal);
          const mealKcal = items.reduce((sum, e) => sum + e.kcal, 0);

          return (
            <section key={meal} className="border-b border-border">
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="text-sm font-semibold">{meal}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {withCommas(mealKcal)}
                </span>
              </div>

              {items.length > 0 && (
                <ul>
                  {items.map((e) => (
                    <li key={e.id}>
                      <Item
                        asChild
                        size="sm"
                        className="rounded-none px-5 py-2.5 active:bg-accent"
                      >
                        <button onClick={() => setDetail(e)} className="text-left">
                          <ItemContent className="min-w-0">
                            <ItemTitle className="font-normal">{e.name}</ItemTitle>
                            <ItemDescription className="text-xs">
                              {e.qty} {e.unit}
                              {e.estimate && " · estimate"}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {withCommas(e.kcal)}
                          </ItemActions>
                        </button>
                      </Item>
                    </li>
                  ))}
                </ul>
              )}

              {/* A button, not a full-bleed strip. The strip read as another
                  row of the meal's list, which is a thing you open rather than
                  a thing you do. */}
              <div className="px-5 pb-4 pt-1">
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => setAddingTo(meal)}
                >
                  <Plus className="size-4" /> Add food
                </Button>
              </div>
            </section>
          );
        })}
      </main>

      <AddSheet
        meal={addingTo}
        onOpenChange={(open) => !open && setAddingTo(null)}
        foods={foods}
        date={date}
      />
      <EntryDetail
        entry={detail}
        food={detail?.food_id ? (foods.find((f) => f.id === detail.food_id) ?? null) : null}
        onClose={() => setDetail(null)}
        onEditFood={(food) => {
          // Close the entry first: two stacked drawers fight over the scroll
          // lock, and the detail has nothing left to say once the form is up.
          setDetail(null);
          setEditing(food);
        }}
      />
      <EditFoodSheet
        food={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        // The corrected row (or its fork) has to reach the catalog this screen
        // was rendered with, and a fork is a new row entirely -- a refresh is
        // the honest way to get both.
        onSaved={() => router.refresh()}
      />
    </>
  );
}

function MacroMeter({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal !== null && value > goal;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {round(value)}
          {goal !== null && <span className="text-muted-foreground"> / {round(goal)}g</span>}
        </span>
      </div>
      {/* The registry's Progress, not a hand-built bar. It carries the
          progressbar role and its aria-valuenow, which two divs and an inline
          width never did. */}
      <Progress
        value={pct}
        aria-label={`${label}: ${round(value)} of ${goal === null ? "no" : round(goal)} grams`}
        className={cn("mt-1.5 h-1", over && "[&>[data-slot=progress-indicator]]:bg-destructive")}
      />
    </div>
  );
}

function EntryDetail({
  entry,
  food,
  onClose,
  onEditFood,
}: {
  entry: Entry | null;
  /** The catalog row this entry was logged against, when it still exists. */
  food: Food | null;
  onClose: () => void;
  onEditFood: (food: Food) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Drawer open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{entry?.name ?? "Entry"}</DrawerTitle>
          <DrawerDescription>Nutrition for this entry.</DrawerDescription>
        </DrawerHeader>

        {entry && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold leading-tight">{entry.name}</h2>
                {food && <FoodSourceBadge source={food.source} />}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {entry.qty} {entry.unit} · {entry.meal}
                {entry.estimate && " · estimate"}
              </p>

              {/* Hand-rolled: see ingredient-sheet.tsx -- Chart is the only
                  registry option and it would pull recharts in to render six
                  numbers. */}
              <dl className="mt-6 grid grid-cols-3 gap-y-5 border-t border-border pt-5">
                {[
                  ["Calories", withCommas(entry.kcal)],
                  ["Protein", `${round(entry.protein_g)}g`],
                  ["Carbs", `${round(entry.carb_g)}g`],
                  ["Fat", `${round(entry.fat_g)}g`],
                  ["Fibre", `${round(entry.fiber_g)}g`],
                  ["Sodium", `${withCommas(entry.sodium_mg)}mg`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-lg tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

            </div>

            <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
              {/* S7 lives here rather than behind an overflow menu: the entry
                  detail IS this screen's overflow, and a drawer already open
                  under a thumb should not need a second menu inside it.
                  Offered only when there is a catalog row to correct. */}
              <ButtonGroup className="w-full">
                {food && (
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={pending}
                    onClick={() => onEditFood(food)}
                  >
                    <Pencil className="size-4" /> Edit food
                  </Button>
                )}
                <ConfirmAction
                  title={`Delete ${entry.name}?`}
                  description={`${round(entry.kcal)} calories come off ${entry.meal}. This cannot be undone.`}
                  onConfirm={() =>
                    startTransition(async () => {
                      const res = await deleteEntry(entry.id);
                      if (res.error) {
                        toast.error(res.error);
                        return;
                      }
                      onClose();
                    })
                  }
                  trigger={
                    <Button
                      variant="outline"
                      className="h-11 flex-1 text-destructive"
                      disabled={pending}
                    >
                      {pending ? "Deleting" : "Delete"}
                    </Button>
                  }
                />
              </ButtonGroup>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
