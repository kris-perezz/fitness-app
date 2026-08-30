"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { searchFoods, scale, qtyLabel, type Food } from "@/lib/food";
import { addEntry } from "@/app/actions";
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
import { Eyebrow } from "@/components/eyebrow";
import { toast } from "sonner";

type Step = { kind: "search" } | { kind: "qty"; food: Food } | { kind: "estimate" };

export function AddSheet({
  open,
  onOpenChange,
  foods,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: Food[];
  date: string;
}) {
  const [step, setStep] = useState<Step>({ kind: "search" });

  // Every open starts from search. Resuming mid-flow is disorienting.
  useEffect(() => {
    if (open) setStep({ kind: "search" });
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Add food</DrawerTitle>
          <DrawerDescription>Search the catalog or enter an estimate.</DrawerDescription>
        </DrawerHeader>

        {step.kind === "search" && (
          <SearchStep
            foods={foods}
            onPick={(food) => setStep({ kind: "qty", food })}
            onEstimate={() => setStep({ kind: "estimate" })}
          />
        )}

        {step.kind === "qty" && (
          <QtyStep
            food={step.food}
            date={date}
            onBack={() => setStep({ kind: "search" })}
            onDone={() => onOpenChange(false)}
          />
        )}

        {step.kind === "estimate" && (
          <EstimateStep
            date={date}
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
  onEstimate,
}: {
  foods: Food[];
  onPick: (food: Food) => void;
  onEstimate: () => void;
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
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 pl-9 text-base"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
        {query === "" && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {foods.length} foods in the catalog.
          </p>
        )}

        {query !== "" && results.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No match for &ldquo;{query}&rdquo;.</p>
          </div>
        )}

        {results.length > 0 && (
          <ul className="divide-y divide-border">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => onPick(f)}
                  className="flex w-full items-baseline justify-between gap-4 py-3.5 text-left transition-colors active:bg-accent"
                >
                  <span className="text-[15px] leading-snug">{f.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {f.kcal}
                    <span className="text-[10px]"> / {f.basis === "per_100g" ? "100g" : f.unit}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="ghost" className="mt-4 w-full text-muted-foreground" onClick={onEstimate}>
          Not in the catalog — estimate it
        </Button>
      </div>
    </div>
  );
}

function QtyStep({
  food,
  date,
  onBack,
  onDone,
}: {
  food: Food;
  date: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const presets = food.basis === "per_100g" ? [100, 150, 200, 300] : [0.5, 1, 2, 3];
  const n = Number(qty);
  const preview = n > 0 ? scale(food, n) : null;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  function save() {
    if (!preview) return;
    startTransition(async () => {
      const res = await addEntry({
        log_date: date,
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
      toast.success(`Added ${food.name}`);
      onDone();
    });
  }

  return (
    <div className="px-4 pb-8">
      <button
        onClick={onBack}
        className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Search
      </button>

      <h2 className="text-lg font-medium leading-tight tracking-tight">{food.name}</h2>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
        {food.kcal} cal · {food.protein_g}g P · {food.fat_g}g F · {food.carb_g}g C per{" "}
        {food.basis === "per_100g" ? "100 g" : food.unit}
      </p>

      <div className="mt-6">
        <Label htmlFor="qty" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {qtyLabel(food)}
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
          className="mt-2 h-16 border-0 border-b border-border px-0 font-mono text-4xl tabular-nums shadow-none focus-visible:border-foreground focus-visible:ring-0"
          placeholder="0"
        />
      </div>

      <div className="mt-3 flex gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setQty(String(p))}
            className="flex-1 rounded-md border border-border py-2 font-mono text-sm tabular-nums transition-colors active:bg-accent"
          >
            {p}
          </button>
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4">
        {[
          ["cal", preview?.kcal],
          ["protein", preview?.protein_g],
          ["fat", preview?.fat_g],
          ["carb", preview?.carb_g],
        ].map(([label, v]) => (
          <div key={label as string}>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </dt>
            <dd className="font-mono text-lg tabular-nums">
              {v === undefined || v === null ? "—" : v}
            </dd>
          </div>
        ))}
      </dl>

      <Button className="mt-6 h-12 w-full text-base" onClick={save} disabled={!preview || pending}>
        Add
      </Button>
    </div>
  );
}

function EstimateStep({
  date,
  onBack,
  onDone,
}: {
  date: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    name: "",
    kcal: "",
    protein_g: "",
    fat_g: "",
    carb_g: "",
    fiber_g: "",
    sodium_mg: "",
  });
  const [pending, startTransition] = useTransition();
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const fields: [keyof typeof f, string][] = [
    ["kcal", "cal"],
    ["protein_g", "protein"],
    ["fat_g", "fat"],
    ["carb_g", "carb"],
    ["fiber_g", "fibre"],
    ["sodium_mg", "sodium"],
  ];

  function save() {
    startTransition(async () => {
      const res = await addEntry({
        log_date: date,
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
      toast.success("Estimate added");
      onDone();
    });
  }

  return (
    <div className="px-4 pb-8">
      <button
        onClick={onBack}
        className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Search
      </button>

      <Eyebrow>Estimate</Eyebrow>
      <p className="mt-1 text-sm text-muted-foreground">
        Round up. A guess should land high, not in the middle.
      </p>

      <Input
        placeholder="What was it?"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        className="mt-4 h-12 text-base"
      />

      <div className="mt-4 grid grid-cols-3 gap-3">
        {fields.map(([key, label]) => (
          <div key={key}>
            <Label
              htmlFor={key}
              className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              {label}
            </Label>
            <Input
              id={key}
              type="number"
              inputMode="decimal"
              value={f[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
              className="mt-1 h-12 border-0 border-b border-border px-0 text-center font-mono text-lg tabular-nums shadow-none focus-visible:border-foreground focus-visible:ring-0"
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <Button
        className="mt-6 h-12 w-full text-base"
        onClick={save}
        disabled={pending || !f.name || !f.kcal}
      >
        Add estimate
      </Button>
    </div>
  );
}
