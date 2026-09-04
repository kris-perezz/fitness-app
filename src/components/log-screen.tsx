"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookmarkPlus,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  Pencil,
  Plus,
} from "lucide-react";
import { MEALS, shiftDate, wakingDate, type Food, type Meal } from "@/lib/food";
import { deleteEntry, saveEntryAsFood } from "@/app/actions";
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
import { fillPercent, isAlarming, statusOf, type Metric, type Tone } from "@/lib/tone";
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
  /** S75. Read here and stored nowhere else -- the tone owns no data (S77). */
  strict_mode?: boolean | null;
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
  // S75. Calm unless the user turned it on. Never suggested, never prompted.
  const tone: Tone = goals?.strict_mode ? "strict" : "calm";

  const today = wakingDate();
  // S71. A day still being lived is not a day you fell short of: at 2pm, under
  // a floor only means dinner has not happened. Yesterday is finished and can
  // be summarised; today cannot.
  const finished = date < today;
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
            {/* Recipes and Trends are Food-section destinations with no tab of
                their own (see bottom-nav.tsx), so this header is the way in.
                They sit after the day arrows because they are not part of them
                -- and Trends sits last because it is the one that leaves
                today behind entirely. */}
            <Button size="icon" variant="ghost" aria-label="Recipes" asChild>
              <Link href="/recipes">
                <CookingPot className="size-5" />
              </Link>
            </Button>
            <Button size="icon" variant="ghost" aria-label="Trends" asChild>
              <Link href="/trends">
                <ChartNoAxesColumn className="size-5" />
              </Link>
            </Button>
          </div>
        </header>

        <section className="border-b border-border px-5 py-6">
          <CalorieRing consumed={totals.kcal} goal={calorieGoal} tone={tone} />

          <div className="mt-6 grid grid-cols-3 gap-4">
            <MacroMeter
              label="Protein"
              metric="protein"
              value={totals.protein_g}
              goal={goals?.protein_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
            <MacroMeter
              label="Carbs"
              metric="carbs"
              value={totals.carb_g}
              goal={goals?.carb_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
            <MacroMeter
              label="Fat"
              metric="fat"
              value={totals.fat_g}
              goal={goals?.fat_goal_g ?? null}
              finished={finished}
              tone={tone}
            />
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
        // S99. The new row has to reach the catalog this screen was rendered
        // with, or the food you just saved is missing from the next search.
        onSavedAsFood={() => router.refresh()}
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

/**
 * One macro, and in strict mode the goal it is measured against (S72/S74).
 *
 * TAKES THE METRIC, NOT JUST THE GOAL. A goal number cannot say which way is
 * good, and this component used to assume every one of them was a ceiling --
 * so protein went `destructive` at 200 g against a 155 g floor, red at the user
 * for hitting the thing they were aiming at. Direction is declared once in
 * `lib/tone.ts` and asked for here.
 *
 * S79: CALM SHOWS THE NUMBER AND STOPS. No `82 / 155g`, no bar behind it -- a
 * fraction is a score whatever colour it is painted, and three of them under
 * the ring turn a day of eating into three things you are behind on. The goals
 * still exist, still drive the calorie split, and still come back the moment
 * strict is on; the calm screen just does not grade you against them.
 */
function MacroMeter({
  label,
  metric,
  value,
  goal,
  finished,
  tone,
}: {
  label: string;
  metric: Metric;
  value: number;
  goal: number | null;
  /** S71. An unfinished day is never short -- dinner has not happened yet. */
  finished: boolean;
  tone: Tone;
}) {
  // S79. The goal is a strict-mode idea. Resolved HERE rather than at the three
  // call sites so there is one place that can ever decide to grade a macro.
  const against = tone === "strict" ? goal : null;
  const alarming = isAlarming(metric, statusOf(metric, value, against, finished), tone);

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {round(value)}
          {against === null ? (
            <span className="text-muted-foreground">g</span>
          ) : (
            <span className="text-muted-foreground"> / {round(against)}g</span>
          )}
        </span>
      </div>
      {/* The registry's Progress, not a hand-built bar. It carries the
          progressbar role and its aria-valuenow, which two divs and an inline
          width never did.

          Absent entirely without a goal, rather than sitting there at zero: a
          bar with nothing to fill against is a progressbar whose aria-valuenow
          is a lie, and visually it reads as a day you have not started. */}
      {against !== null && (
        <Progress
          value={fillPercent(value, against)}
          aria-label={`${label}: ${round(value)} of ${round(against)} grams`}
          className={cn(
            "mt-1.5 h-1",
            alarming && "[&>[data-slot=progress-indicator]]:bg-destructive",
          )}
        />
      )}
    </div>
  );
}

function EntryDetail({
  entry,
  food,
  onClose,
  onEditFood,
  onSavedAsFood,
}: {
  entry: Entry | null;
  /** The catalog row this entry was logged against, when it still exists. */
  food: Food | null;
  onClose: () => void;
  onEditFood: (food: Food) => void;
  onSavedAsFood: () => void;
}) {
  // One transition per action, not one for the sheet: a shared flag makes the
  // Delete button announce "Deleting" while a save is what is actually running.
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const pending = saving || deleting;

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
                {/* S99. The other half of the same slot: an entry with a
                    catalog row behind it can be corrected, and one without can
                    be turned into a row. Only ever one of the two shows, so
                    the group stays at two buttons under a thumb. */}
                {!food && entry.food_id === null && (
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={pending}
                    onClick={() =>
                      startSave(async () => {
                        const res = await saveEntryAsFood(entry.id);
                        if (res.error || !res.food) {
                          toast.error(res.error ?? "Could not save that as a food.");
                          return;
                        }
                        // Says forward-looking out loud. This entry keeps the
                        // numbers and the estimate flag it was logged with.
                        toast.success(`Saved ${res.food.name}. Next time it is in search.`);
                        onSavedAsFood();
                        onClose();
                      })
                    }
                  >
                    <BookmarkPlus className="size-4" /> Save as food
                  </Button>
                )}
                <ConfirmAction
                  title={`Delete ${entry.name}?`}
                  description={`${round(entry.kcal)} calories come off ${entry.meal}. This cannot be undone.`}
                  onConfirm={() =>
                    startDelete(async () => {
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
                      {deleting ? "Deleting" : "Delete"}
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
