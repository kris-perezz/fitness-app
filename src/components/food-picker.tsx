"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, ChevronLeft, Plus, ScanBarcode, Search } from "lucide-react";
import { searchFoods, show, basisLabel, type Food } from "@/lib/food";
import { readLabel, saveLabelFood } from "@/app/actions";
import { downscaleToDataUrl } from "@/lib/image";
import type { LabelDraft } from "@/lib/label";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { FoodSourceBadge } from "@/components/food-source-badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
 * The four ways to name a food: search the catalog, scan a barcode, photograph
 * a label, or give up and type it. Three of them end in a `Food`, and this
 * component owns all three.
 *
 * It lives apart from the add sheet because a recipe ingredient has to be
 * picked exactly the same way an entry is (S15) -- and the moment there are two
 * pickers, one of them starts missing the scanner, or the label reader, or the
 * source badge. The caller supplies only what happens AFTER a food is named:
 * the log turns it into an entry, a recipe turns it into an ingredient.
 */
export type PickerStep =
  | { kind: "search" }
  | { kind: "scan" }
  | { kind: "label"; barcode: string | null };

export function FoodPicker({
  foods,
  step,
  onStep,
  onPick,
  onCustom,
}: {
  foods: Food[];
  step: PickerStep;
  /** Step state is the caller's so it can reset the picker and size its sheet. */
  onStep: (step: PickerStep) => void;
  /**
   * `scanned` is true when the food may not exist in `foods` yet -- a fresh
   * Open Food Facts result is assembled in memory and has never been written,
   * and anything referencing it by id has to save the catalog row first (S3).
   */
  onPick: (food: Food, scanned: boolean) => void;
  /** Omitted where typing a one-off makes no sense, which hides the button. */
  onCustom?: () => void;
}) {
  if (step.kind === "scan") {
    return (
      <BarcodeScanner
        onFood={(food) => onPick(food, true)}
        onMiss={(barcode) => onStep({ kind: "label", barcode })}
        onBack={() => onStep({ kind: "search" })}
      />
    );
  }

  if (step.kind === "label") {
    return (
      <LabelStep
        barcode={step.barcode}
        // Already written to the catalog by saveLabelFood, so it is not
        // "scanned" in the sense that matters here.
        onFood={(food) => onPick(food, false)}
        onBack={() => onStep({ kind: "search" })}
      />
    );
  }

  return (
    <SearchStep
      foods={foods}
      onPick={(food) => onPick(food, false)}
      onScan={() => onStep({ kind: "scan" })}
      onLabel={() => onStep({ kind: "label", barcode: null })}
      onCustom={onCustom}
    />
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
  onCustom?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
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

        {/* Directly under the search field rather than pinned to the bottom.
            The sheet opens at its 60% snap point, but `snapped` makes
            DrawerContent h-full and vaul translates it down -- so anything at
            the bottom of the content sits below the fold until the sheet is
            dragged all the way up. These are the entry points to three of the
            four ways to add a food; they have to be visible on open. */}
        <ButtonGroup className="mt-2 w-full">
          <Button variant="outline" className="h-11 flex-1" onClick={onScan}>
            <ScanBarcode className="size-4" /> Scan
          </Button>
          <Button variant="outline" className="h-11 flex-1" onClick={onLabel}>
            <Camera className="size-4" /> Label
          </Button>
          {onCustom && (
            <Button variant="outline" className="h-11 flex-1" onClick={onCustom}>
              <Plus className="size-4" /> Create
            </Button>
          )}
        </ButtonGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
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
                Scan its barcode, or photograph its label.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {results.length > 0 && (
          <ul className="divide-y divide-border">
            {results.map((f) => (
              <li key={f.id}>
                <Item asChild size="sm" className="rounded-none px-5 py-3 active:bg-accent">
                  {/* Disabled while a pick is in flight: a slow request used
                      to let a second tap fire a second insert. */}
                  <button
                    onClick={() => {
                      setPicked(f.id);
                      onPick(f);
                    }}
                    disabled={picked !== null}
                    className="text-left disabled:opacity-60"
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{f.name}</ItemTitle>
                      {/* S6. Below the name rather than beside it: the badge
                          must never push the name into an ellipsis, and the
                          description line is where the row already answers
                          "what am I looking at". */}
                      <ItemDescription className="flex items-center gap-1.5 text-xs">
                        <span>
                          {show(f.kcal)} cal per {basisLabel(f)}
                        </span>
                        <FoodSourceBadge source={f.source} />
                      </ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              </li>
            ))}
          </ul>
        )}

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
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-4 text-muted-foreground"
        >
          <ChevronLeft className="size-4" /> Back
        </Button>

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
