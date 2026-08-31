"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, ChevronLeft, Plus, ScanBarcode, Search } from "lucide-react";
import {
  searchFoods,
  scale,
  show,
  qtyLabel,
  basisLabel,
  type Food,
  type Meal,
} from "@/lib/food";
import { addEntry, readLabel, saveLabelFood, saveScannedFood } from "@/app/actions";
import { downscaleToDataUrl } from "@/lib/image";
import type { LabelDraft } from "@/lib/label";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
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
  // `scanned` foods may not exist in `foods` yet -- a fresh Open Food Facts
  // result is assembled in memory and has never been written. Since
  // intake_entries.food_id is a foreign key, the catalog row has to land
  // before the entry does (S3).
  | { kind: "qty"; food: Food; scanned: boolean }
  | { kind: "label"; barcode: string | null }
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
            onPick={(food) => go({ kind: "qty", food, scanned: false })}
            onScan={() => go({ kind: "scan" })}
            onLabel={() => go({ kind: "label", barcode: null })}
            onCustom={() => go({ kind: "custom" })}
          />
        )}

        {meal && step.kind === "label" && (
          <LabelStep
            barcode={step.barcode}
            onFood={(food) => go({ kind: "qty", food, scanned: false })}
            onBack={() => go({ kind: "search" })}
          />
        )}

        {meal && step.kind === "scan" && (
          <BarcodeScanner
            onFood={(food) => go({ kind: "qty", food, scanned: true })}
            onMiss={(barcode) => go({ kind: "label", barcode })}
            onBack={() => go({ kind: "search" })}
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

function SearchStep({
  foods,
  onPick,
  onScan,
  onLabel,
  onCustom,
}: {
  foods: Food[];
  onPick: (food: Food) => void;
  onScan: () => void;
  onLabel: () => void;
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
      <div className="shrink-0 px-5 pb-3">
        <InputGroup className="h-11">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a food"
            autoComplete="off"
            enterKeyHint="search"
            className="text-base"
          />
        </InputGroup>
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
                <Item asChild size="sm" className="rounded-none px-5 py-3 active:bg-accent">
                  <button onClick={() => onPick(f)} className="text-left">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{f.name}</ItemTitle>
                      <ItemDescription className="text-xs">
                        {show(f.kcal)} cal per {basisLabel(f)}
                      </ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              </li>
            ))}
          </ul>
        )}

      </div>

      {/* The three ways to get a food that searching cannot reach, at equal
          weight and in one place. The barcode button used to live inside the
          search field, which split the two camera actions across two unrelated
          parts of the sheet and squeezed its own tap target to 36px. */}
      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={onScan}>
            <ScanBarcode className="size-4" /> Scan
          </Button>
          <Button variant="outline" className="h-11 flex-1" onClick={onLabel}>
            <Camera className="size-4" /> Label
          </Button>
          <Button variant="outline" className="h-11 flex-1" onClick={onCustom}>
            <Plus className="size-4" /> Create
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * S4/S5. Photograph a nutrition panel, check what was read off it, save.
 *
 * The draft is shown in the units the LABEL uses -- per serving where the panel
 * is per serving -- because the entire point is checking it against the packet
 * in your hand, and "49.2 per 100 ml" cannot be checked against a panel that
 * says 160. It is converted back to the app's per-100 basis on save.
 */
function LabelStep({
  barcode,
  onFood,
  onBack,
}: {
  barcode: string | null;
  onFood: (food: Food) => void;
  onBack: () => void;
}) {
  type Phase =
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "draft"; draft: LabelDraft; warning: string | null }
    | { kind: "failed"; message: string };

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [form, setForm] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-serving where the label was, so the numbers on screen are the numbers
  // printed on the package.
  const perServing = (draft: LabelDraft) =>
    draft.basis === "per_100g" && draft.grams_per_unit ? draft.grams_per_unit / 100 : 1;

  function loadDraft(draft: LabelDraft, warning: string | null) {
    const f = perServing(draft);
    const at = (n: number | null) => String(Math.round(((n ?? 0) * f + Number.EPSILON) * 10) / 10);
    setForm({
      name: draft.name,
      kcal: String(Math.round(draft.kcal * f)),
      protein_g: at(draft.protein_g),
      carb_g: at(draft.carb_g),
      fat_g: at(draft.fat_g),
      fiber_g: at(draft.fiber_g),
      sodium_mg: at(draft.sodium_mg),
    });
    setPhase({ kind: "draft", draft, warning });
  }

  async function pick(file: File) {
    setPhase({ kind: "reading" });
    let image: string;
    try {
      image = await downscaleToDataUrl(file);
    } catch {
      setPhase({ kind: "failed", message: "That photo could not be opened." });
      return;
    }

    const res = await readLabel(image);
    if (res.status === "found") loadDraft(res.draft, res.warning);
    else setPhase({ kind: "failed", message: res.message });
  }

  function save() {
    if (phase.kind !== "draft") return;
    const f = perServing(phase.draft);
    const num = (key: string) => {
      const parsed = Number(form[key]);
      return Number.isFinite(parsed) ? parsed / f : 0;
    };

    startTransition(async () => {
      const res = await saveLabelFood(
        {
          ...phase.draft,
          name: form.name.trim(),
          kcal: num("kcal"),
          protein_g: num("protein_g"),
          carb_g: num("carb_g"),
          fat_g: num("fat_g"),
          fiber_g: num("fiber_g"),
          sodium_mg: num("sodium_mg"),
        },
        barcode,
      );
      if (res.error || !res.food) {
        toast.error(res.error ?? "Could not save that food");
        return;
      }
      // Straight into the existing quantity step -- extraction produces a food,
      // never an entry.
      onFood(res.food);
    });
  }

  const draft = phase.kind === "draft" ? phase.draft : null;
  const basisText =
    draft === null
      ? ""
      : draft.basis === "per_unit"
        ? `per ${draft.unit}`
        : draft.grams_per_unit
          ? `per serving (${draft.grams_per_unit} ${draft.unit})`
          : `per 100 ${draft.unit}`;

  const macroFields: [string, string][] = [
    ["kcal", "Calories"],
    ["protein_g", "Protein (g)"],
    ["carb_g", "Carbs (g)"],
    ["fat_g", "Fat (g)"],
    ["fiber_g", "Fibre (g)"],
    ["sodium_mg", "Sodium (mg)"],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        <button
          onClick={onBack}
          className="-ml-1 mb-4 flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so retaking the same file fires change again.
            e.target.value = "";
            if (file) void pick(file);
          }}
        />

        {phase.kind === "idle" && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera />
              </EmptyMedia>
              <EmptyTitle>Photograph the nutrition panel</EmptyTitle>
              <EmptyDescription>
                Fill the frame with the panel itself. Everything read off it is editable
                before anything is saved.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {phase.kind === "reading" && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Spinner className="size-6" />
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Reading the label
            </p>
          </div>
        )}

        {phase.kind === "failed" && (
          <p aria-live="polite" className="py-6 text-sm text-muted-foreground">
            {phase.message}
          </p>
        )}

        {draft !== null && (
          <>
            <p className="text-xs text-muted-foreground">
              Read from the label, {basisText}. Check every number against the package.
            </p>

            {phase.kind === "draft" && phase.warning && (
              <p className="mt-3 text-xs text-destructive">{phase.warning}</p>
            )}

            {barcode !== null && (
              <p className="mt-3 text-xs text-muted-foreground">
                Saved against barcode {barcode}, so the next scan finds it straight away.
              </p>
            )}

            <Field className="mt-4">
              <FieldLabel htmlFor="label_name" className="text-xs font-normal text-muted-foreground">
                Name
              </FieldLabel>
              <Input
                id="label_name"
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-11 text-base"
                placeholder="Product name"
                // Nothing legible on the packet, so this is the one field the
                // user has to supply; put the cursor in it rather than making
                // them hunt for the reason Save is disabled.
                autoFocus={(form.name ?? "") === ""}
              />
            </Field>

            <FieldGroup className="mt-4 grid grid-cols-2 gap-3">
              {macroFields.map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel
                    htmlFor={`label_${key}`}
                    className="text-xs font-normal text-muted-foreground"
                  >
                    {label}
                  </FieldLabel>
                  <Input
                    id={`label_${key}`}
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
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        {draft === null ? (
          <Button
            className="h-11 w-full text-base"
            disabled={phase.kind === "reading"}
            onClick={() => fileRef.current?.click()}
          >
            {phase.kind === "reading"
              ? "Reading"
              : phase.kind === "failed"
                ? "Try another photo"
                : "Take a photo"}
          </Button>
        ) : (
          <Button
            className="h-11 w-full text-base"
            onClick={save}
            disabled={pending || (form.name ?? "").trim() === ""}
          >
            {pending ? "Saving" : "Save food"}
          </Button>
        )}
      </div>
    </div>
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
  // A per_100g food is measured in grams, so opening at "1" asks the user to
  // confirm one gram of a protein shake. Prefer the label's own serving when
  // the scan captured one -- one shake is what was actually drunk -- and fall
  // back to 100, which is at least the basis the numbers are quoted in.
  const [qty, setQty] = useState(() =>
    food.basis === "per_100g" ? String(food.grams_per_unit ?? 100) : "1",
  );
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // With a known serving, half and double it are the useful jumps; the round
  // hundreds only make sense when nothing better is known. Sorted so the row
  // reads left to right.
  const presets =
    food.basis !== "per_100g"
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
          {show(food.kcal)} cal · {show(food.protein_g)}g protein · {show(food.carb_g)}g carbs ·{" "}
          {show(food.fat_g)}g fat per {basisLabel(food)}
          {food.basis === "per_100g" && food.grams_per_unit
            ? ` · 1 serving = ${food.grams_per_unit} ${food.unit}`
            : ""}
        </p>

        <Field className="mt-5">
          <FieldLabel htmlFor="qty" className="text-xs font-normal text-muted-foreground">
            Serving size ({qtyLabel(food)})
          </FieldLabel>
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
