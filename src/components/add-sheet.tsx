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
import { toast } from "sonner";

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

  useEffect(() => {
    if (meal) setStep({ kind: "search" });
  }, [meal]);

  return (
    <Drawer open={meal !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">Add to {meal}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Search foods or enter one manually.
          </DrawerDescription>
        </DrawerHeader>

        {meal && step.kind === "search" && (
          <SearchStep
            foods={foods}
            onPick={(food) => setStep({ kind: "qty", food })}
            onScan={() => setStep({ kind: "scan" })}
            onCustom={() => setStep({ kind: "custom" })}
          />
        )}

        {meal && step.kind === "scan" && (
          <BarcodeScanner
            onFood={(food) => setStep({ kind: "qty", food })}
            onBack={() => setStep({ kind: "search" })}
          />
        )}

        {meal && step.kind === "qty" && (
          <QtyStep
            food={step.food}
            date={date}
            meal={meal}
            onBack={() => setStep({ kind: "search" })}
            onDone={() => onOpenChange(false)}
          />
        )}

        {meal && step.kind === "custom" && (
          <CustomStep
            date={date}
            meal={meal}
            onBack={() => setStep({ kind: "search" })}
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
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-5 pb-3">
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

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        {query === "" && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {foods.length} foods available.
          </p>
        )}

        {query !== "" && results.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No results for &ldquo;{query}&rdquo;.
          </p>
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

        <div className="px-5">
          <Button variant="outline" className="mt-4 w-full" onClick={onCustom}>
            Create a food
          </Button>
        </div>
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
  const preview = n > 0 ? scale(food, n) : null;

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
    <div className="px-5 pb-8">
      <button
        onClick={onBack}
        className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Back
      </button>

      <h3 className="text-base font-semibold leading-tight">{food.name}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {food.kcal} cal · {food.protein_g}g protein · {food.carb_g}g carbs · {food.fat_g}g fat per{" "}
        {food.basis === "per_100g" ? "100 g" : food.unit}
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
            className="flex-1 rounded-md border border-border py-2 text-sm tabular-nums transition-colors active:bg-accent"
          >
            {p}
          </button>
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
        {[
          ["Calories", preview?.kcal],
          ["Protein", preview?.protein_g],
          ["Carbs", preview?.carb_g],
          ["Fat", preview?.fat_g],
        ].map(([label, v]) => (
          <div key={label as string}>
            <dd className="text-lg tabular-nums">{v === undefined || v === null ? "-" : v}</dd>
            <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      <Button className="mt-6 h-11 w-full text-base" onClick={save} disabled={!preview || pending}>
        Add
      </Button>
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
    <div className="max-h-full overflow-y-auto px-5 pb-8">
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

      <Button
        className="mt-6 h-11 w-full text-base"
        onClick={save}
        disabled={pending || !f.name || !f.kcal}
      >
        Add
      </Button>
    </div>
  );
}
