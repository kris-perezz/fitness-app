"use client";

import { useState, useTransition } from "react";
import { updateFood, type FoodEdit } from "@/app/actions";
import { basisLabel, countLabel, measureLabel, show, sourceHint, type Food } from "@/lib/food";
import { FoodSourceBadge } from "@/components/food-source-badge";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";

/**
 * S7. Correct a food once and every future log of it is right.
 *
 * The fields are quoted on the food's OWN basis -- per 100 g for a scanned
 * product, per unit for a countable one -- because that is what the stored
 * numbers are, and showing anything else would mean converting the user's
 * typing back and forth for no gain. The label step converts (there the point
 * is checking against a printed panel); here the point is fixing a stored row.
 */
const FIELDS: [keyof FoodEdit, string][] = [
  ["kcal", "Calories"],
  ["protein_g", "Protein (g)"],
  ["carb_g", "Carbs (g)"],
  ["fat_g", "Fat (g)"],
  ["fiber_g", "Fibre (g)"],
  ["sodium_mg", "Sodium (mg)"],
];

export function EditFoodSheet({
  food,
  onOpenChange,
  onSaved,
}: {
  food: Food | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (food: Food) => void;
}) {
  return (
    <Drawer open={food !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Edit {food?.name ?? "food"}</DrawerTitle>
          <DrawerDescription>Correct this food&rsquo;s stored numbers.</DrawerDescription>
        </DrawerHeader>
        {/* Keyed so reopening on a different food starts from that food's
            values rather than the last one's half-edited form. */}
        {food && (
          <EditForm
            key={food.id}
            food={food}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function EditForm({
  food,
  onOpenChange,
  onSaved,
}: {
  food: Food;
  onOpenChange: (open: boolean) => void;
  onSaved?: (food: Food) => void;
}) {
  const [name, setName] = useState(food.name);
  const [serving, setServing] = useState(
    food.grams_per_unit === null ? "" : String(food.grams_per_unit),
  );
  const [weightUnit, setWeightUnit] = useState<"g" | "ml">(food.weight_unit);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map(([key]) => [key, key === "sodium_mg" && food.sodium_mg === null
        ? ""
        : String(show(food[key as keyof Food] as number | null))]),
    ),
  );
  const [pending, startTransition] = useTransition();

  // A per_100g food's serving size is optional and genuinely unknown when
  // absent (lib/off.ts); a per_unit food's is how much one of whatever it is
  // counted in comes to. Blank means unknown in both cases, never zero.
  //
  // This is the number S40 turns on: fill it in and the food can be logged by
  // volume or weight as well as by the count.
  const servingLabel =
    food.basis === "per_100g"
      ? "One serving"
      : `How much one ${countLabel(food, 1)} is`;

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const orNull = (v: string) => (v.trim() === "" ? null : Number(v));

  function save() {
    startTransition(async () => {
      const res = await updateFood(food.id, {
        name,
        grams_per_unit: orNull(serving),
        weight_unit: weightUnit,
        kcal: num(form.kcal),
        protein_g: num(form.protein_g),
        carb_g: num(form.carb_g),
        fat_g: num(form.fat_g),
        fiber_g: num(form.fiber_g),
        sodium_mg: orNull(form.sodium_mg),
      });
      if (res.error || !res.food) {
        toast.error(res.error ?? "Could not save that food");
        return;
      }
      toast.success("Food updated");
      onSaved?.(res.food);
      onOpenChange(false);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight">{food.name}</h2>
          <FoodSourceBadge source={food.source} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{sourceHint(food.source)}</p>

        <p className="mt-3 text-xs text-muted-foreground">
          Everything below is per {basisLabel(food)}. Changing it fixes every future log of
          this food; portions already logged keep the numbers they were logged with.
        </p>

        <Field className="mt-4">
          <FieldLabel htmlFor="edit_name" className="text-xs font-normal text-muted-foreground">
            Name
          </FieldLabel>
          <Input
            id="edit_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 text-base"
          />
        </Field>

        <Field className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel
              htmlFor="edit_serving"
              className="text-xs font-normal text-muted-foreground"
            >
              {servingLabel}
            </FieldLabel>
            {/* Grams or millilitres. Offered only where it is a real question:
                a per_100g food answers it in `unit` already, and letting the
                two disagree is exactly what 0008 exists to prevent. */}
            {food.basis !== "per_100g" && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={weightUnit}
                onValueChange={(next) => next && setWeightUnit(next as "g" | "ml")}
              >
                <ToggleGroupItem value="g" className="px-3 text-xs">
                  g
                </ToggleGroupItem>
                <ToggleGroupItem value="ml" className="px-3 text-xs">
                  ml
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <Input
            id="edit_serving"
            type="number"
            inputMode="decimal"
            value={serving}
            onChange={(e) => setServing(e.target.value)}
            className="h-11 text-base tabular-nums"
            placeholder="Unknown"
          />
          <p className="text-xs text-muted-foreground">
            {serving.trim() === ""
              ? `Fill this in to log ${food.name} by ${measureLabel(food)} as well as by the ${countLabel(food, 1)}.`
              : `One ${countLabel(food, 1)} is ${serving} ${weightUnit}.`}
          </p>
        </Field>

        <FieldGroup className="mt-4 grid grid-cols-2 gap-3">
          {FIELDS.map(([key, label]) => (
            <Field key={key}>
              <FieldLabel
                htmlFor={`edit_${key}`}
                className="text-xs font-normal text-muted-foreground"
              >
                {label}
              </FieldLabel>
              <Input
                id={`edit_${key}`}
                type="number"
                inputMode="decimal"
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
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
          disabled={pending || name.trim() === ""}
        >
          {pending ? "Saving" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
