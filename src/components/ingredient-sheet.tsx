"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { scale, show, qtyLabel, basisLabel, type Food } from "@/lib/food";
import { addRecipeIngredient, saveScannedFood } from "@/app/actions";
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
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { liftForKeyboard } from "@/lib/sheet";
import { toast } from "sonner";

/** Same snap behaviour as the add sheet, for the same reasons (see add-sheet.tsx). */
const SNAP_POINTS = [0.6, 1] as const;

type Step = PickerStep | { kind: "qty"; food: Food; scanned: boolean };

/**
 * S15. Adding an ingredient is picking a food and saying how much -- which is
 * the add sheet's job minus the meal and the date, so it runs on the same
 * FoodPicker. Scanning a barcode straight into a recipe works for free as a
 * result, which is the whole reason the picker was lifted out.
 */
export function IngredientSheet({
  recipeId,
  foods,
  open,
  onOpenChange,
  onAdded,
}: {
  recipeId: string;
  foods: Food[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset on each fresh open, adjusted during render for the same reason the
  // add sheet does it: an effect would paint the previous ingredient's step.
  if (open && !wasOpen) {
    setWasOpen(true);
    setStep({ kind: "search" });
    setSnap(SNAP_POINTS[0]);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function go(next: Step) {
    setStep(next);
    if (next.kind !== "search") setSnap(1);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerContent snapped onFocusCapture={liftForKeyboard(setSnap)}>
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">Add ingredient</DrawerTitle>
          <DrawerDescription className="sr-only">
            Search, scan or photograph a food to add it to this recipe.
          </DrawerDescription>
        </DrawerHeader>

        {step.kind !== "qty" && (
          <FoodPicker
            foods={foods}
            step={step}
            onStep={go}
            onPick={(food, scanned) => go({ kind: "qty", food, scanned })}
            // No "Create": a one-off with no catalog row cannot be referenced by
            // recipe_ingredients.food_id, and inventing one silently would put
            // a food in the shared catalog that nobody asked to save.
          />
        )}

        {step.kind === "qty" && (
          <IngredientQtyStep
            recipeId={recipeId}
            food={step.food}
            scanned={step.scanned}
            onBack={() => go({ kind: "search" })}
            onDone={() => {
              onAdded();
              onOpenChange(false);
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * How much of it went in. `qty` is stored in the food's own convention -- a
 * COUNT for per_unit foods, GRAMS for per_100g ones (open decision 3) -- so
 * "2 eggs" reads back as "2 eggs" rather than as 100 g of egg.
 */
function IngredientQtyStep({
  recipeId,
  food,
  scanned,
  onBack,
  onDone,
}: {
  recipeId: string;
  food: Food;
  scanned: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(() => (food.basis === "per_100g" ? "100" : "1"));
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const n = Number(qty);
  const preview = Number.isFinite(n) && n > 0 ? scale(food, n) : null;

  const presets =
    food.basis === "per_100g"
      ? food.grams_per_unit
        ? [food.grams_per_unit, food.grams_per_unit * 2, 100, 250]
        : [50, 100, 200, 500]
      : [1, 2, 3, 4];

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
      // The catalog row lands first: recipe_ingredients.food_id is a foreign
      // key, so a never-before-seen scan would otherwise fail it (S3).
      if (scanned) {
        const saved = await saveScannedFood(food);
        if (saved.error) {
          toast.error(saved.error);
          return;
        }
      }

      const res = await addRecipeIngredient(recipeId, food.id, n);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onDone();
    });
  }

  const previewRows: [string, number | null][] = [
    ["Calories", preview?.kcal ?? null],
    ["Protein", preview?.protein_g ?? null],
    ["Carbs", preview?.carb_g ?? null],
    ["Fat", preview?.fat_g ?? null],
  ];

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
        <p className="mt-0.5 text-xs text-muted-foreground">
          {show(food.kcal)} cal · {show(food.protein_g)}g protein · {show(food.carb_g)}g carbs ·{" "}
          {show(food.fat_g)}g fat per {basisLabel(food)}
        </p>

        <Field className="mt-5">
          <FieldLabel
            htmlFor="ingredient_qty"
            className="text-xs font-normal text-muted-foreground"
          >
            {food.basis === "per_100g" ? `Amount (${qtyLabel(food)})` : `How many ${food.unit}`}
          </FieldLabel>
          <Input
            ref={inputRef}
            id="ingredient_qty"
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

        {/* Hand-rolled: the registry's only figure-display component is Chart,
            which would pull recharts in to render four numbers. A description
            list is the correct element for label/value pairs anyway. */}
        <dl className="mt-6 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
          {previewRows.map(([label, value]) => (
            <div key={label}>
              <dd className="text-lg tabular-nums">{value ?? "-"}</dd>
              <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
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
          {pending ? "Adding" : "Add ingredient"}
        </Button>
      </div>
    </div>
  );
}
