"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MEALS, shiftDate, wakingDate, type Food, type Meal } from "@/lib/food";
import { deleteEntry } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AddSheet } from "@/components/add-sheet";
import { CalorieRing } from "@/components/calorie-ring";
import { toast } from "sonner";

type Entry = {
  id: string;
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
                      <button
                        onClick={() => setDetail(e)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-2.5 text-left transition-colors active:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{e.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {e.qty} {e.unit}
                            {e.estimate && " · estimate"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {withCommas(e.kcal)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => setAddingTo(meal)}
                className="flex w-full items-center gap-1.5 px-5 py-3 text-left text-sm font-medium text-primary transition-colors active:bg-accent"
              >
                <Plus className="size-4" /> Add food
              </button>
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
      <EntryDetail entry={detail} onClose={() => setDetail(null)} />
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
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={
            "h-full rounded-full transition-[width] " + (over ? "bg-destructive" : "bg-primary")
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EntryDetail({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
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
              <h2 className="text-lg font-semibold leading-tight">{entry.name}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {entry.qty} {entry.unit} · {entry.meal}
                {entry.estimate && " · estimate"}
              </p>

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
              <Button
                variant="outline"
                className="h-11 w-full text-destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteEntry(entry.id);
                    if (res.error) {
                      toast.error(res.error);
                      return;
                    }
                    onClose();
                  })
                }
              >
                {pending ? "Deleting" : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
