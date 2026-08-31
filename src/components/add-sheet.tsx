"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ScanBarcode, Search } from "lucide-react";
import { searchFoods, scale, qtyLabel, type Food, type Meal } from "@/lib/food";
import { addEntry } from "@/app/actions";
import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";

/**
 * Opens at 60% -- enough for the search field and the first results without
 * burying the day behind it -- and drags or taps to full height from there.
 * Defining snap points also turns on vaul's input repositioning, which is what
 * keeps a focused field above the keyboard.
 */
const SNAP_POINTS = [0.6, 1] as const;

type Step =
  | { kind: "search" }
  | { kind: "scan" }
  | { kind: "qty"; food: Food }
  | { kind: "custom" };

export function AddSheet({
  meal,
  onOpenChange,
  foods,
  date,
}: {
  meal: Meal | null;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  date: string;
}) {
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [openedFor, setOpenedFor] = useState<Meal | null>(meal);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  // Reset to the search step when a *different* meal opens the sheet. Adjusted
  // during render rather than in an effect: an effect would paint the previous
  // meal's step for a frame first, and React re-runs this before committing.
  // Nothing is unmounted on close, so the exit animation keeps its content.
  if (meal !== null && meal !== openedFor) {
    setOpenedFor(meal);
    setStep({ kind: "search" });
    setSnap(SNAP_POINTS[0]);
  }

  /**
   * Steps that need the whole screen take it, rather than making the user drag
   * first: the camera wants the height, and the two forms would otherwise open
   * with their inputs against the fold.
   */
  function go(next: Step) {
    setStep(next);
    if (next.kind !== "search") setSnap(1);
  }

  return (
    <Drawer
      open={meal !== null}
      onOpenChange={onOpenChange}
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerContent snapped>
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">Add to {meal}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Search foods or enter one manually.
          </DrawerDescription>
        </DrawerHeader>

        {meal && step.kind === "search" && (
          <SearchStep
            foods={foods}
            onPick={(food) => go({ kind: "qty", food })}
            onScan={() => go({ kind: "scan" })}
            onCustom={() => go({ kind: "custom" })}
          />
        )}

        {meal && step.kind === "scan" && (
          <BarcodeScanner
            onFood={(food) => go({ kind: "qty", food })}
            onBack={() => go({ kind: "search" })}
          />
        )}

        {meal && step.kind === "qty" && (
          <QtyStep
            food={step.food}
            date={date}
            meal={meal}
            onBack={() => go({ kind: "search" })}
            onDone={() => onOpenChange(false)}
          />
        )}

        {meal && step.kind === "custom" && (
          <CustomStep
            date={date}
            meal={meal}
            onBack={() => go({ kind: "search" })}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SearchStep({
  foods,
  onPick,
  onScan,
  onCustom,
}: {
  foods: Food[];
  onPick: (food: Food) => void;
  onScan: () => void;
  onCustom: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchFoods(foods, query), [foods, query]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-5 pb-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a food"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          onClick={onScan}
          aria-label="Scan a barcode"
        >
          <ScanBarcode className="size-5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {query === "" && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>Search your foods</EmptyTitle>
              <EmptyDescription>
                {foods.length} saved, or scan a barcode to pull one in.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {query !== "" && results.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>No match for &ldquo;{query}&rdquo;</EmptyTitle>
              <EmptyDescription>
                Scan its barcode, or create the food by hand below.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {results.length > 0 && (
          <ul className="divide-y divide-border">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => onPick(f)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors active:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{f.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {f.kcal} cal per {f.basis === "per_100g" ? "100 g" : f.unit}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <Button variant="outline" className="h-11 w-full text-base" onClick={onCustom}>
          Create a food
        </Button>
      </div>
    </div>
  );
}

function QtyStep({
  food,
  date,
  meal,
  onBack,
  onDone,
}: {
  food: Food;
  date: string;
  meal: Meal;
  onBack: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const presets = food.basis === "per_100g" ? [100, 150, 200, 300] : [0.5, 1, 2, 3];
  const n = Number(qty);
  // Null, never undefined: a half-typed quantity has no preview, and the
  // difference between "not yet known" and "zero" has to survive into the UI.
  const preview = Number.isFinite(n) && n > 0 ? scale(food, n) : null;

  const previewRows: { label: string; value: number | null }[] = [
    { label: "Calories", value: preview?.kcal ?? null },
    { label: "Protein", value: preview?.protein_g ?? null },
    { label: "Carbs", value: preview?.carb_g ?? null },
    { label: "Fat", value: preview?.fat_g ?? null },
  ];

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 120);
    return () => clearTimeout(t);
  }, []);

  function save() {
    if (!preview) return;
    startTransition(async () => {
      const res = await addEntry({
        log_date: date,
        meal,
        food_id: food.id,
        name: food.name,
        qty: n,
        unit: qtyLabel(food),
        estimate: false,
        ...preview,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added to ${meal}`);
      onDone();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        <button
          onClick={onBack}
          className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </button>

        <h3 className="text-base font-semibold leading-tight">{food.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {food.kcal} cal · {food.protein_g}g protein · {food.carb_g}g carbs · {food.fat_g}g fat
          per {food.basis === "per_100g" ? "100 g" : food.unit}
        </p>

        <div className="mt-5 space-y-2">
          <Label htmlFor="qty" className="text-xs text-muted-foreground">
            Serving size ({qtyLabel(food)})
          </Label>
          <Input
            ref={inputRef}
            id="qty"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-12 text-base tabular-nums"
          />
        </div>

        <div className="mt-3 flex gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setQty(String(p))}
              className="h-11 flex-1 rounded-md border border-border text-sm tabular-nums transition-colors active:bg-accent"
            >
              {p}
            </button>
          ))}
        </div>

        <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
          {previewRows.map((row) => (
            <div key={row.label}>
              <dd className="text-lg tabular-nums">{row.value ?? "-"}</dd>
              <dt className="mt-0.5 text-[11px] text-muted-foreground">{row.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <Button
          className="h-11 w-full text-base"
          onClick={save}
          disabled={preview === null || pending}
        >
          {pending ? "Adding" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function CustomStep({
  date,
  meal,
  onBack,
  onDone,
}: {
  date: string;
  meal: Meal;
  onBack: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    name: "",
    kcal: "",
    protein_g: "",
    carb_g: "",
    fat_g: "",
    fiber_g: "",
    sodium_mg: "",
  });
  const [pending, startTransition] = useTransition();
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const fields: [keyof typeof f, string][] = [
    ["kcal", "Calories"],
    ["protein_g", "Protein (g)"],
    ["carb_g", "Carbs (g)"],
    ["fat_g", "Fat (g)"],
    ["fiber_g", "Fibre (g)"],
    ["sodium_mg", "Sodium (mg)"],
  ];

  function save() {
    startTransition(async () => {
      const res = await addEntry({
        log_date: date,
        meal,
        food_id: null,
        name: f.name,
        qty: 1,
        unit: "serving",
        estimate: true,
        kcal: num(f.kcal),
        protein_g: num(f.protein_g),
        fat_g: num(f.fat_g),
        carb_g: num(f.carb_g),
        fiber_g: num(f.fiber_g),
        sodium_mg: num(f.sodium_mg),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added to ${meal}`);
      onDone();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        <button
          onClick={onBack}
          className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </button>

        <Input
          placeholder="Food name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-11 text-base"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          {fields.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-xs text-muted-foreground">
                {label}
              </Label>
              <Input
                id={key}
                type="number"
                inputMode="decimal"
                value={f[key]}
                onChange={(e) => setF({ ...f, [key]: e.target.value })}
                className="h-11 text-base tabular-nums"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <Button
          className="h-11 w-full text-base"
          onClick={save}
          disabled={pending || f.name.trim() === "" || f.kcal === ""}
        >
          {pending ? "Adding" : "Add"}
        </Button>
      </div>
    </div>
  );
}
