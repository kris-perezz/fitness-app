"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, ChevronLeft, ImageUp, Leaf, Plus, ScanBarcode, Search } from "lucide-react";
import { searchFoods, show, basisLabel, type Food } from "@/lib/food";
import { readLabel, saveLabelFood, searchCnfFoods, addCnfFood } from "@/app/actions";
import { CNF_ATTRIBUTION, CNF_LICENCE_URL, cnfFoodId, type CnfHit } from "@/lib/cnf";
import { collapseGroups, displayName, groupForId } from "@/lib/food-groups";
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
  /**
   * `group` is the food's siblings (S92) -- the other forms of the same food,
   * in curated order -- so the caller can offer the raw/cooked choice without
   * going back to the database for rows it has just been handed. Empty for the
   * foods that have no forms, which is nearly all of them.
   */
  onPick: (food: Food, scanned: boolean, group?: Food[]) => void;
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
      onPick={(food, group) => onPick(food, false, group)}
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
  onPick: (food: Food, group?: Food[]) => void;
  onScan: () => void;
  onLabel: () => void;
  onCustom?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Ranked, then folded so a food with several forms appears once (S92).
   * Collapsing AFTER ranking keeps the member the query actually matched -- a
   * search for "grilled" should not surrender its place to whichever form the
   * curated file happens to list first.
   */
  const results = useMemo(
    () => collapseGroups(searchFoods(foods, query), (f) => f.id),
    [foods, query],
  );

  /** The forms of a collapsed row that are actually in the catalog. */
  const siblings = (food: Food): Food[] => {
    const group = groupForId(food.id);
    if (!group) return [];
    const byId = new Map(foods.map((f) => [f.id, f]));
    return group.variants.flatMap((v) => byId.get(v.id) ?? []);
  };

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
                Look it up in Health Canada below, scan its barcode, or photograph its label.
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
                      onPick(f, siblings(f));
                    }}
                    disabled={picked !== null}
                    className="text-left disabled:opacity-60"
                  >
                    <ItemContent className="min-w-0">
                      {/* The GROUP's name where there is one: this row stands
                          for every form of the food, so it must not be labelled
                          with the one form that happened to rank first. */}
                      <ItemTitle className="font-normal">{displayName(f)}</ItemTitle>
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

        {/* Keyed on the query so a new search REMOUNTS this rather than
            resetting four pieces of state in an effect. Editing the search
            after a lookup must not leave results for a word no longer on
            screen. */}
        {query !== "" && <CnfSection key={query} query={query} onPick={onPick} />}
      </div>
    </div>
  );
}

/**
 * S91. The Canadian Nutrient File, reached from the same search box.
 *
 * BELOW the local results and never mixed into them, because the two lists
 * answer different questions: yours is "the food I have logged before", this is
 * "the food Health Canada measured". Interleaving them would put a reference
 * preparation above the row you built out of a real label.
 *
 * ON DEMAND, not per keystroke. The search itself is a filter over a cached
 * catalog and costs nothing, but firing it on every character would render a
 * shifting list under the one the user is already reading. A tap says "I did
 * not find it", which is exactly when this is wanted.
 */
function CnfSection({
  query,
  onPick,
}: {
  query: string;
  onPick: (food: Food, group?: Food[]) => void;
}) {
  const [hits, setHits] = useState<CnfHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const search = () => {
    startTransition(async () => {
      const res = await searchCnfFoods(query);
      if (res.status === "error") {
        setError(res.message);
        setHits([]);
        return;
      }
      setError(null);
      // Already folded: rankCnf collapses a curated group BEFORE its own limit,
      // so folding here as well would be a second opinion on a decision that
      // has to be made where the limit is applied (S92).
      setHits(res.hits);
    });
  };

  const choose = (hit: CnfHit) => {
    setPicking(hit.code);
    startTransition(async () => {
      const res = await addCnfFood(hit.code, hit.description);
      setPicking(null);
      if (res.error || !res.food) {
        toast.error(res.error ?? "Could not add that food.");
        return;
      }
      // Already written to the catalog by the action, so it is not "scanned" in
      // the sense the caller cares about. The action materialises the whole
      // group, so its forms come back with it.
      onPick(res.food, res.group);
    });
  };

  if (hits === null) {
    return (
      <div className="px-5 py-4">
        <Button variant="outline" className="h-11 w-full" onClick={search} disabled={pending}>
          {pending ? <Spinner /> : <Leaf className="size-4" />}
          Search Health Canada
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <p className="px-5 pt-4 text-xs text-muted-foreground">
        Health Canada · per 100 g, laboratory values for a reference food
      </p>
      {/* REQUIRED, not a footnote. The Open Government Licence - Canada grants
          these rights on condition the source is acknowledged and the licence
          linked where feasible, and the grant ends automatically if it is not.
          It sits with the results rather than in an About screen because this
          is the screen where the information is actually used. */}
      <p className="px-5 pt-1 text-[11px] text-muted-foreground">
        {CNF_ATTRIBUTION}{" "}
        <a
          href={CNF_LICENCE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Licence
        </a>
      </p>

      {error && <p className="px-5 py-3 text-sm text-muted-foreground">{error}</p>}

      {!error && hits.length === 0 && (
        <p className="px-5 py-3 text-sm text-muted-foreground">
          Nothing in the Canadian Nutrient File matches &ldquo;{query}&rdquo;.
        </p>
      )}

      <ul className="divide-y divide-border">
        {hits.map((hit) => (
          <li key={hit.code}>
            <Item asChild size="sm" className="rounded-none px-5 py-3 active:bg-accent">
              <button
                onClick={() => choose(hit)}
                disabled={picking !== null}
                className="text-left disabled:opacity-60"
              >
                <ItemContent className="min-w-0">
                  {/* CNF's FULL description, not a shortened one. Two rows here
                      routinely differ only in their last clause -- raw against
                      grilled is about a 30% swing per 100 g -- so trimming it
                      would turn a real choice into a coin toss (S91).
                      A CURATED group is the exception and not a contradiction:
                      the distinction is still made, it has just moved to a
                      toggle in the drawer where it can be labelled (S92). */}
                  <ItemTitle className="font-normal whitespace-normal">
                    {groupForId(cnfFoodId(hit.code))?.name ?? hit.description}
                  </ItemTitle>
                </ItemContent>
                {picking === hit.code && <Spinner />}
              </button>
            </Item>
          </li>
        ))}
      </ul>
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
  // Two inputs rather than one: `capture` is a hint the browser cannot be asked
  // to drop per click, so a single input either always opens the camera or
  // never does. A label is as often already in the camera roll -- photographed
  // in the shop, sent by someone else, screenshotted off a product page -- as
  // it is in front of you.
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

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
      // Reached most often by an upload rather than a capture: pickers on
      // Android hand back PDFs and HEICs that the canvas cannot decode.
      setPhase({ kind: "failed", message: "That file could not be opened as a photo." });
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

        {/* Cleared on change so picking the same file again fires it again. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pick(file);
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
                Take a photo with the panel filling the frame, or upload one you already
                have. Everything read off it is editable before anything is saved.
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
          <ButtonGroup className="w-full">
            <Button
              className="h-11 flex-1 text-base"
              disabled={phase.kind === "reading"}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-4" />
              {phase.kind === "reading"
                ? "Reading"
                : phase.kind === "failed"
                  ? "Retake"
                  : "Take a photo"}
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 text-base"
              disabled={phase.kind === "reading"}
              onClick={() => uploadRef.current?.click()}
            >
              <ImageUp className="size-4" /> Upload
            </Button>
          </ButtonGroup>
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
