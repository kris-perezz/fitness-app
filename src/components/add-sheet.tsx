"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { scale, show, qtyLabel, basisLabel, sourceHint, type Food, type Meal } from "@/lib/food";
import { addEntry, saveScannedFood } from "@/app/actions";
import { FoodPicker, type PickerStep } from "@/components/food-picker";
import { FoodSourceBadge } from "@/components/food-source-badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";

/**
 * Opens at 60% -- enough for the search field and the first results without
 * burying the day behind it -- and drags or taps to full height from there.
 * Defining snap points also turns on vaul's input repositioning, which is what
 * keeps a focused field above the keyboard.
 */
const SNAP_POINTS = [0.6, 1] as const;

/**
 * The picker's own steps plus the two this sheet adds: confirming a quantity,
 * and typing a one-off that never becomes a catalog row at all.
 */
type Step =
  | PickerStep
  // `scanned` foods may not exist in `foods` yet -- a fresh Open Food Facts
  // result is assembled in memory and has never been written. Since
  // intake_entries.food_id is a foreign key, the catalog row has to land
  // before the entry does (S3).
  | { kind: "qty"; food: Food; scanned: boolean }
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

        {meal && (step.kind === "search" || step.kind === "scan" || step.kind === "label") && (
          <FoodPicker
            foods={foods}
            step={step}
            onStep={go}
            onPick={(food, scanned) => go({ kind: "qty", food, scanned })}
            onCustom={() => go({ kind: "custom" })}
          />
        )}

        {meal && step.kind === "qty" && (
          <QtyStep
            food={step.food}
            scanned={step.scanned}
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

function QtyStep({
  food,
  scanned,
  date,
  meal,
  onBack,
  onDone,
}: {
  food: Food;
  scanned: boolean;
  date: string;
  meal: Meal;
  onBack: () => void;
  onDone: () => void;
}) {
  // S5. A packaged food knows what one serving is, so it can be logged either
  // way: "1 shake" is what a person drinks, "260 ml" is what is left in the
  // carton. Only offered when the serving size is actually known -- inventing
  // one would make "1 serving" mean nothing.
  const canServe =
    food.basis === "per_100g" && food.grams_per_unit !== null && food.grams_per_unit > 0;
  const [mode, setMode] = useState<"serving" | "amount">(canServe ? "serving" : "amount");

  const [qty, setQty] = useState(() => (canServe || food.basis !== "per_100g" ? "1" : "100"));
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  /** Carry the amount across the switch, so toggling never silently changes it. */
  function switchMode(next: "serving" | "amount") {
    const current = Number(qty);
    const per = food.grams_per_unit ?? 100;
    if (Number.isFinite(current) && current > 0) {
      setQty(
        next === "amount"
          ? String(Math.round(current * per))
          : String(Math.round((current / per) * 100) / 100),
      );
    }
    setMode(next);
  }

  // Whole and half servings when counting servings. When counting grams or
  // millilitres: multiples of the real serving where one is known, and round
  // hundreds only when nothing better is available.
  const presets =
    food.basis !== "per_100g" || mode === "serving"
      ? [0.5, 1, 2, 3]
      : food.grams_per_unit
        ? [
            Math.round(food.grams_per_unit / 2),
            food.grams_per_unit,
            Math.round(food.grams_per_unit * 1.5),
            food.grams_per_unit * 2,
          ]
        : [100, 150, 200, 300];
  const n = Number(qty);

  /**
   * `scale()` takes grams for a per_100g food and a count for a per_unit one,
   * so servings are converted here and nowhere else.
   */
  const scaleQty = mode === "serving" && canServe ? n * food.grams_per_unit! : n;

  /** How the entry reads back in the log. Entries denormalise qty and unit for
   * display only -- the macros are stored separately -- so "1 serving" is an
   * honest label for a portion that was logged as one. */
  const entryUnit =
    mode === "serving" && canServe ? (n === 1 ? "serving" : "servings") : qtyLabel(food);
  // Null, never undefined: a half-typed quantity has no preview, and the
  // difference between "not yet known" and "zero" has to survive into the UI.
  const preview = Number.isFinite(n) && n > 0 ? scale(food, scaleQty) : null;

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
      // Write the catalog row first: the entry's food_id references it, so a
      // never-before-seen scan would otherwise fail the foreign key. Saving is
      // idempotent -- a barcode already in the catalog is somebody's confirmed
      // food and is left exactly as it is (S3).
      if (scanned) {
        const saved = await saveScannedFood(food);
        if (saved.error) {
          toast.error(saved.error);
          return;
        }
      }

      const res = await addEntry({
        log_date: date,
        meal,
        food_id: food.id,
        name: food.name,
        qty: n,
        unit: entryUnit,
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-4 text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </Button>

        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold leading-tight">{food.name}</h3>
          <FoodSourceBadge source={food.source} />
        </div>
        {/* The scanned path is the one that lands here with numbers nobody has
            checked, so the hierarchy gets a full sentence rather than a badge
            at the moment it matters -- just before the entry is written. */}
        {food.source === "off" && (
          <p className="mt-1 text-xs text-muted-foreground">{sourceHint(food.source)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {show(food.kcal)} cal · {show(food.protein_g)}g protein · {show(food.carb_g)}g carbs ·{" "}
          {show(food.fat_g)}g fat per {basisLabel(food)}
          {food.basis === "per_100g" && food.grams_per_unit
            ? ` · 1 serving = ${food.grams_per_unit} ${food.unit}`
            : ""}
        </p>

        <Field className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="qty" className="text-xs font-normal text-muted-foreground">
              {mode === "serving" && canServe ? "Servings" : `Amount (${qtyLabel(food)})`}
            </FieldLabel>
            {canServe && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={mode}
                // A single ToggleGroup deselects when its active item is pressed
                // again, which would leave no mode at all; ignore the empty value.
                onValueChange={(next) => next && switchMode(next as "serving" | "amount")}
              >
                <ToggleGroupItem value="serving" className="px-3 text-xs">
                  Servings
                </ToggleGroupItem>
                <ToggleGroupItem value="amount" className="px-3 text-xs">
                  {food.unit === "ml" ? "ml" : "g"}
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
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
        </Field>

        <ButtonGroup className="mt-3 w-full">
          {presets.map((p) => (
            <Button
              key={p}
              variant="outline"
              className="h-11 flex-1 tabular-nums"
              onClick={() => setQty(String(p))}
            >
              {p}
            </Button>
          ))}
        </ButtonGroup>

        {/* Hand-rolled: see ingredient-sheet.tsx -- Chart is the only registry
            option and it would pull recharts in to render four numbers. */}
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-4 text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </Button>

        <Input
          placeholder="Food name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-11 text-base"
        />

        <FieldGroup className="mt-4 grid grid-cols-2 gap-3">
          {fields.map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={key} className="text-xs font-normal text-muted-foreground">
                {label}
              </FieldLabel>
              <Input
                id={key}
                type="number"
                inputMode="decimal"
                value={f[key]}
                onChange={(e) => setF({ ...f, [key]: e.target.value })}
                className="h-11 text-base tabular-nums"
                placeholder="0"
              />
            </Field>
          ))}
        </FieldGroup>
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
