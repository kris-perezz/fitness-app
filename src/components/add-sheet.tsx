"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, ChevronLeft, ImageUp, Sparkles, X } from "lucide-react";
import {
  scale,
  show,
  basisLabel,
  canMeasure,
  countLabel,
  countToMeasure,
  measureLabel,
  measureToCount,
  qtyFromCount,
  qtyFromMeasure,
  scaledMicros,
  scaledSugar,
  sourceHint,
  type Food,
  type Meal,
} from "@/lib/food";
import { addEntry, saveScannedFood, estimateEntry } from "@/app/actions";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { MACROS, rowsFrom, scaleOf, totals, type Row } from "@/lib/portion";
import { liftForKeyboard } from "@/lib/sheet";
import { downscaleToDataUrl } from "@/lib/image";
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
  const [wasOpen, setWasOpen] = useState(meal !== null);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  // Reset on every OPEN, not merely when a different meal opens the sheet.
  // Keying on the meal meant adding a second food to the same meal reopened on
  // the previous food's quantity step -- the sheet had never been told the
  // difference between "still open" and "opened again".
  //
  // Adjusted during render rather than in an effect: an effect would paint the
  // stale step for a frame first, and React re-runs this before committing.
  // Reset on open rather than on close so the exit animation keeps its content.
  if (meal !== null && !wasOpen) {
    setWasOpen(true);
    setStep({ kind: "search" });
    setSnap(SNAP_POINTS[0]);
  } else if (meal === null && wasOpen) {
    setWasOpen(false);
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
      <DrawerContent snapped onFocusCapture={liftForKeyboard(setSnap)}>
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

/** "Servings", "Cups", "Slices" -- the counting noun as a field label. */
function countFieldLabel(food: Food): string {
  const label = countLabel(food, 2);
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  // S5 and S40. A food that knows what one of it weighs can be logged either
  // way: "1 cup" is what you pour, "150 ml" is what you actually poured. The
  // gate asks only whether that weight is known -- NOT how the food arrived,
  // which is what used to confine this to scanned per_100g products and left
  // milk countable in whole cups only. Inventing a serving size for a food that
  // has none would make "1 serving" mean nothing, so that case stays counted.
  const switchable = canMeasure(food);
  const [mode, setMode] = useState<"count" | "measure">(
    // Counting is the default wherever there is something to count: "1 bottle"
    // and "1 cup" are how people describe what they had. A per_100g food with
    // no serving size has nothing countable, so it opens on grams.
    switchable || food.basis === "per_unit" ? "count" : "measure",
  );

  const [qty, setQty] = useState(() => (switchable || food.basis === "per_unit" ? "1" : "100"));
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  /** Carry the amount across the switch, so toggling never silently changes it. */
  function switchMode(next: "count" | "measure") {
    const current = Number(qty);
    if (Number.isFinite(current) && current > 0) {
      setQty(
        next === "measure"
          ? String(Math.round(countToMeasure(food, current)))
          : String(Math.round(measureToCount(food, current) * 100) / 100),
      );
    }
    setMode(next);
  }

  // Whole and half of the countable thing when counting. When measuring:
  // multiples of one of it where that is known, and round hundreds only when
  // nothing better is available.
  const presets =
    mode === "count"
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
   * `scale()` takes grams for a per_100g food and a count for a per_unit one.
   * Both input modes land back on that convention here and nowhere else.
   */
  const scaleQty = mode === "count" ? qtyFromCount(food, n) : qtyFromMeasure(food, n);

  /** How the entry reads back in the log. Entries denormalise qty and unit for
   * display only -- the macros are stored separately -- so "1 cup" is an
   * honest label for a portion that was poured as one. */
  const entryUnit = mode === "count" ? countLabel(food, n) : measureLabel(food);
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
        // S38. Scaled by the same factor as the macros beside them and stored
        // on the row, so a correction to the food tomorrow cannot rewrite what
        // this entry contained.
        micros: scaledMicros(food, scaleQty),
        sugar_g: scaledSugar(food, scaleQty),
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
        {/* `cnf` joins `off` here, and for a second reason on top of the first:
            the Open Government Licence requires the acknowledgement to travel
            with the information, and this is the last screen before a CNF
            number becomes an entry. */}
        {(food.source === "off" || food.source === "cnf") && (
          <p className="mt-1 text-xs text-muted-foreground">{sourceHint(food.source, food.derived_from)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {show(food.kcal)} cal · {show(food.protein_g)}g protein · {show(food.carb_g)}g carbs ·{" "}
          {show(food.fat_g)}g fat per {basisLabel(food)}
          {food.grams_per_unit
            ? ` · 1 ${countLabel(food, 1)} = ${food.grams_per_unit} ${food.weight_unit}`
            : ""}
        </p>

        <Field className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="qty" className="text-xs font-normal text-muted-foreground">
              {mode === "count" ? countFieldLabel(food) : `Amount (${measureLabel(food)})`}
            </FieldLabel>
            {switchable && (
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={mode}
                // A single ToggleGroup deselects when its active item is pressed
                // again, which would leave no mode at all; ignore the empty value.
                onValueChange={(next) => next && switchMode(next as "count" | "measure")}
              >
                <ToggleGroupItem value="count" className="px-3 text-xs">
                  {countLabel(food, 2)}
                </ToggleGroupItem>
                <ToggleGroupItem value="measure" className="px-3 text-xs">
                  {food.weight_unit}
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
  const [estimating, setEstimating] = useState(false);
  /**
   * S101. The downscaled data URL and a label for the row that says one is
   * attached. Held here rather than sent immediately: the photo is half the
   * question and the description is the other half, so nothing goes anywhere
   * until the user taps estimate.
   */
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Two inputs, not one: `capture` is a hint the browser cannot be asked to
  // drop per click, so a single input either always opens the camera or never
  // does. The same reasoning as LabelStep, and the same reason -- a meal is as
  // often photographed a minute ago as it is right now.
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  /** S102. The itemised plate behind the six numbers. See lib/portion.ts. */
  const [rows, setRows] = useState<Row[]>([]);
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const fields: [keyof typeof f, string][] = [
    ["kcal", "Calories"],
    ["protein_g", "Protein (g)"],
    ["carb_g", "Carbs (g)"],
    ["fat_g", "Fat (g)"],
    ["fiber_g", "Fibre (g)"],
    ["sodium_mg", "Sodium (mg)"],
  ];

  /**
   * S100. Only while every number is still blank.
   *
   * This is the whole of the overwrite design. A returned value can never land
   * on top of something typed, re-estimating is a deliberate gesture that costs
   * clearing the fields, and there is no confirm-before-overwrite screen to
   * build because the situation it would guard cannot arise.
   */
  const untouched = fields.every(([key]) => f[key] === "");

  /** One decimal, matching what every other macro field in the app shows. */
  const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

  async function attach(file: File) {
    setPhotoError(null);
    try {
      setPhoto(await downscaleToDataUrl(file));
    } catch {
      // Reached most often by an upload rather than a capture: Android pickers
      // hand back HEICs and PDFs the canvas cannot decode.
      setPhotoError("That file could not be opened as a photo.");
    }
  }

  /**
   * The six boxes as strings, from a set of rows. Whole numbers for calories and
   * sodium and one decimal for the rest, matching what the form shows already.
   */
  function boxesFrom(next: Row[]) {
    const sums = totals(next);
    return Object.fromEntries(
      MACROS.map((field) => [
        field,
        String(field === "kcal" || field === "sodium_mg" ? Math.round(sums[field]) : round1(sums[field])),
      ]),
    ) as Record<(typeof MACROS)[number], string>;
  }

  /** A corrected mass re-derives all six totals, with no second API call. */
  function reweigh(index: number, grams: string) {
    const next = rows.map((row, n) => (n === index ? { ...row, grams } : row));
    setRows(next);
    setF((prev) => ({ ...prev, ...boxesFrom(next) }));
  }

  function estimate() {
    setEstimating(true);
    startTransition(async () => {
      const res = await estimateEntry(f.name, photo);
      setEstimating(false);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      // Not an error: saying more about the food is the useful next step, and
      // the fields stay empty so nothing has to be undone first.
      if (res.status === "vague") {
        toast.warning(res.message);
        return;
      }

      const e = res.estimate;
      const next = rowsFrom(e.components);
      setRows(next);
      setF((prev) => ({
        ...prev,
        // The assumptions go into the NAME, which is where this user already
        // writes them by hand and where the day list will keep showing them.
        // A separate panel would be a second place to look for the same thing.
        name: e.assumptions ? `${prev.name.trim()} — ${e.assumptions}` : prev.name,
        // Re-summed locally rather than read off `e`, even though nothing has
        // been corrected yet and the two agree to the digit. One path means a
        // first estimate and a re-weighed one cannot round differently.
        ...boxesFrom(next),
      }));
    });
  }

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
        // A typed one-off carries no micronutrients, and empty is the honest
        // answer rather than a set of zeroes -- nobody typed them (S36's rule,
        // applied to the path where the data never existed).
        micros: {},
        sugar_g: null,
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

        {/* S100. The field was always a description -- people type "korean army
            stew, 3 bowls x ~1.5 cups contents" in here. The placeholder now
            says so, because the estimate is only as good as what it is given. */}
        <Input
          placeholder="What you ate, and roughly how much"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-11 text-base"
        />

        {/* Cleared on change so picking the same file twice fires it twice. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void attach(file);
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void attach(file);
          }}
        />

        {/* S101. The photo says what is on the plate and how much; the line
            above says what it cannot show -- the oil, the milk, the sauce, a
            weight off a scale. Neither is the whole question, which is why both
            go in the same request and why this sits directly under the text. */}
        <ButtonGroup className="mt-2 w-full">
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => cameraRef.current?.click()}
            disabled={pending}
          >
            <Camera className="size-4" /> {photo ? "Retake" : "Photo"}
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => uploadRef.current?.click()}
            disabled={pending}
          >
            <ImageUp className="size-4" /> Upload
          </Button>
          {photo && (
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => setPhoto(null)}
              disabled={pending}
            >
              <X className="size-4" /> Remove
            </Button>
          )}
        </ButtonGroup>

        {photoError && <p className="mt-2 text-xs text-destructive">{photoError}</p>}

        {photo && (
          /* A data URL has no remote host for next/image to optimise and no
             intrinsic width to reason about, and lib/image.ts has already cut
             it to 1600px on the long edge before it ever reaches here. */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt="The meal being estimated"
            className="mt-2 h-40 w-full rounded-md object-cover"
          />
        )}

        {/* Offered only when there is something to estimate FROM and nothing to
            overwrite. Disabled rather than hidden: it disappearing the moment a
            digit is typed would read as a bug. */}
        <Button
          variant="outline"
          className="mt-2 h-11 w-full"
          onClick={estimate}
          disabled={pending || (f.name.trim() === "" && photo === null) || !untouched}
        >
          {estimating ? <Spinner /> : <Sparkles className="size-4" />}
          {untouched ? "Estimate these" : "Clear the numbers to re-estimate"}
        </Button>

        {/* S102. The masses the estimate ran on, where the person who saw the
            plate can overrule them. This is the whole point of itemising: a
            measured plate came back 35-45% high because ONE assumed weight was
            too big, and a single prose sentence left no way to say so short of
            rejecting all six numbers.

            Hidden once every field is blank, which is the "clear to re-estimate"
            gesture -- a weight list with nothing to weigh would be a leftover. */}
        {rows.length > 0 && !untouched && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">
              What it weighed. Fix one and the numbers follow.
            </p>
            <ItemGroup className="mt-1 gap-1">
              {rows.map((row, index) => (
                <Item key={`${row.base.item}-${index}`} size="xs" variant="muted">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate">{row.base.item}</ItemTitle>
                    <ItemDescription className="tabular-nums">
                      {Math.round(row.base.kcal * scaleOf(row))} kcal
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {row.base.grams === null ? (
                      /* No mass was guessed, so there is nothing to correct --
                         an egg is an egg. Said plainly rather than shown as an
                         empty box the user would try to type into. */
                      <span className="text-xs text-muted-foreground">as served</span>
                    ) : (
                      <InputGroup className="w-24">
                        <InputGroupInput
                          type="number"
                          inputMode="numeric"
                          value={row.grams}
                          onChange={(e) => reweigh(index, e.target.value)}
                          // Selected on focus so the first digit replaces the
                          // guess, matching the weight field on progress.
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={`Grams of ${row.base.item}`}
                          className="tabular-nums"
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>g</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        )}

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
