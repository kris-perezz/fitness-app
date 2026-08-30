"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal } from "lucide-react";
import type { Food } from "@/lib/food";
import { deleteEntry } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Eyebrow } from "@/components/eyebrow";
import { Gauge } from "@/components/gauge";
import { AddSheet } from "@/components/add-sheet";
import { toast } from "sonner";

type Entry = {
  id: string;
  name: string;
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

type Settings = {
  cal_daily_equiv: number;
  protein_floor_g: number;
  fat_floor_g: number;
} | null;

const n = (v: number) => Math.round(v).toLocaleString();

export function LogScreen({
  date,
  foods,
  entries,
  settings,
}: {
  date: string;
  foods: Food[];
  entries: Entry[];
  settings: Settings;
}) {
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Entry | null>(null);

  const totals = entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal,
      protein_g: a.protein_g + e.protein_g,
      fat_g: a.fat_g + e.fat_g,
      carb_g: a.carb_g + e.carb_g,
      fiber_g: a.fiber_g + e.fiber_g,
      sodium_mg: a.sodium_mg + e.sodium_mg,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0, fiber_g: 0, sodium_mg: 0 },
  );

  const noTargets = settings === null;
  const calTarget = settings?.cal_daily_equiv ?? null;
  const proTarget = settings?.protein_floor_g ?? null;

  // Calories are a ceiling you spend down; protein is a floor you still owe.
  // Both count toward zero, which is the number worth acting on.
  const calLeft = calTarget === null ? null : calTarget - totals.kcal;
  const proOwed = proTarget === null ? null : Math.max(0, proTarget - totals.protein_g);

  const heading = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <Eyebrow>{heading}</Eyebrow>
          <Link
            href="/targets"
            aria-label="Targets"
            className="-mr-2 p-2 text-muted-foreground transition-colors active:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
          </Link>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-x-6">
          <Figure
            label="Calories left"
            value={calLeft === null ? "—" : n(calLeft)}
            state={calLeft !== null && calLeft < 0 ? "over" : "neutral"}
          />
          <Figure
            label="Protein owed"
            value={proOwed === null ? "—" : `${n(proOwed)}g`}
            state={proOwed !== null && proOwed > 0 ? "under" : "neutral"}
          />

          <div className="mt-3">
            <Gauge
              value={totals.kcal}
              target={calTarget}
              state={calLeft !== null && calLeft < 0 ? "over" : "neutral"}
            />
          </div>
          <div className="mt-3">
            <Gauge
              value={totals.protein_g}
              target={proTarget}
              state={proOwed !== null && proOwed > 0 ? "under" : "neutral"}
            />
          </div>

          <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {n(totals.kcal)}
            {calTarget !== null && ` of ${n(calTarget)}`}
          </p>
          <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {n(totals.protein_g)}g
            {proTarget !== null && ` of ${n(proTarget)}g`}
          </p>
        </section>

        {noTargets && (
          <Link
            href="/targets"
            className="mt-5 block rounded-md border border-border px-4 py-3 text-sm"
          >
            Set your calorie and protein targets to see what is left.
          </Link>
        )}

        <dl className="mt-8 flex justify-between border-y border-border py-3 font-mono text-[11px] tabular-nums">
          {[
            ["fat", `${n(totals.fat_g)}g`],
            ["carb", `${n(totals.carb_g)}g`],
            ["fibre", `${n(totals.fiber_g)}g`],
            ["sodium", `${n(totals.sodium_mg)}`],
          ].map(([label, value]) => (
            <div key={label} className="text-center">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-8">
          <Eyebrow>Logged</Eyebrow>

          {entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing yet. The day starts with the first thing you eat.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setDetail(e)}
                    className="flex w-full items-baseline justify-between gap-4 py-3.5 text-left transition-colors active:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] leading-snug">
                        {e.name}
                        {e.estimate && (
                          <span className="ml-1.5 align-middle font-mono text-[10px] text-muted-foreground">
                            EST
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                        {e.qty} {e.unit} · {n(e.protein_g)}g P
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{n(e.kcal)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <div className="pointer-events-auto mx-auto max-w-md px-5">
          <Button className="h-12 w-full text-base" onClick={() => setAdding(true)}>
            <Plus className="size-5" /> Add food
          </Button>
        </div>
      </div>

      <AddSheet open={adding} onOpenChange={setAdding} foods={foods} date={date} />
      <EntryDetail entry={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function Figure({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "neutral" | "over" | "under";
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p
        className={
          "mt-1 font-mono text-[2.75rem] leading-none tabular-nums tracking-tight " +
          (state === "over"
            ? "text-destructive"
            : state === "under"
              ? "text-amber-600"
              : "text-foreground")
        }
      >
        {value}
      </p>
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
          <div className="px-5 pb-8">
            <h2 className="text-lg font-medium leading-tight tracking-tight">{entry.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {entry.qty} {entry.unit}
              {entry.estimate && " · estimate"}
            </p>

            <dl className="mt-6 grid grid-cols-3 gap-y-5 border-t border-border pt-5">
              {[
                ["cal", n(entry.kcal)],
                ["protein", `${n(entry.protein_g)}g`],
                ["fat", `${n(entry.fat_g)}g`],
                ["carb", `${n(entry.carb_g)}g`],
                ["fibre", `${n(entry.fiber_g)}g`],
                ["sodium", `${n(entry.sodium_mg)}mg`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            <Button
              variant="outline"
              className="mt-8 h-12 w-full text-destructive"
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
              Remove
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
