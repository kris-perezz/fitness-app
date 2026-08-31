"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { searchExercises, EQUIPMENT, MUSCLE_GROUPS, type Exercise } from "@/lib/training";
import { matchedAlias } from "@/lib/search";
import { createExercise } from "@/app/training-actions";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { liftForKeyboard } from "@/lib/sheet";
import { toast } from "sonner";

/** Same snap behaviour as the add sheet, for the same reasons (add-sheet.tsx). */
const SNAP_POINTS = [0.6, 1] as const;

/**
 * S27/S28. Finding an exercise behaves exactly like finding a food -- same
 * ranking function (lib/search.ts), same layout, same "create it inline"
 * escape hatch -- so there is only one thing to learn.
 *
 * It is a separate component from FoodPicker rather than a generic one: the
 * shared part is the ranking, which is already shared, and the rest (a scanner,
 * a label reader, a source badge) has no counterpart here. Forcing one
 * component to serve both would mean a prop for every difference.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  exercises,
  recentExerciseIds,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  recentExerciseIds: string[];
  onPick: (exercise: Exercise) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [wasOpen, setWasOpen] = useState(open);

  if (open && !wasOpen) {
    setWasOpen(true);
    setCreating(false);
    setSnap(SNAP_POINTS[0]);
  } else if (!open && wasOpen) {
    setWasOpen(false);
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
          <DrawerTitle className="text-base">Add exercise</DrawerTitle>
          <DrawerDescription className="sr-only">
            Search the exercise catalog or create one.
          </DrawerDescription>
        </DrawerHeader>

        {creating ? (
          <CreateStep
            onBack={() => setCreating(false)}
            onCreated={(exercise) => onPick(exercise)}
          />
        ) : (
          <SearchStep
            exercises={exercises}
            recentExerciseIds={recentExerciseIds}
            onPick={onPick}
            onCreate={() => {
              setCreating(true);
              setSnap(1);
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function SearchStep({
  exercises,
  recentExerciseIds,
  onPick,
  onCreate,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  onPick: (exercise: Exercise) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchExercises(exercises, query), [exercises, query]);

  // S27. Most sessions are the same dozen lifts, so recency alone removes the
  // search step from the common case. Order follows recentExerciseIds, which is
  // newest-first, not the alphabetical order the catalog arrives in.
  const recent = useMemo(() => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    return recentExerciseIds.map((id) => byId.get(id)).filter((e): e is Exercise => e != null);
  }, [exercises, recentExerciseIds]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const shown = query === "" ? recent : results;

  // Only meaningful while searching -- the recent list is not a match for
  // anything, so nothing there has a reason to explain.
  const aliasFor = (e: Exercise) => (query === "" ? null : matchedAlias(e, query));

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
            placeholder="Search exercises"
            autoComplete="off"
            enterKeyHint="search"
            className="text-base"
          />
        </InputGroup>

        {/* Above the fold for the same reason as the add sheet's action row:
            `snapped` makes DrawerContent h-full, so anything pinned to the
            bottom sits below the fold until the sheet is dragged up. */}
        <ButtonGroup className="mt-2 w-full">
          <Button variant="outline" className="h-11 flex-1" onClick={onCreate}>
            <Plus className="size-4" /> Create an exercise
          </Button>
        </ButtonGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
        {query === "" && recent.length > 0 && (
          <p className="px-5 pb-1 text-xs font-medium text-muted-foreground">Recent</p>
        )}

        {query === "" && recent.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>Search the catalog</EmptyTitle>
              <EmptyDescription>
                {exercises.length} exercises. Once you have trained a few sessions, the ones
                you actually use show up here first.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {query !== "" && results.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>No match for &ldquo;{query}&rdquo;</EmptyTitle>
              <EmptyDescription>Create it above and carry on with the session.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {shown.length > 0 && (
          <ul className="divide-y divide-border">
            {shown.map((e) => (
              <li key={e.id}>
                <Item asChild size="sm" className="rounded-none px-5 py-3 active:bg-accent">
                  {/* Disabled while a pick is in flight: a slow request used
                      to let a second tap fire a second insert. */}
                  <button
                    onClick={() => {
                      setPicked(e.id);
                      onPick(e);
                    }}
                    disabled={picked !== null}
                    className="text-left disabled:opacity-60"
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{e.name}</ItemTitle>
                      <ItemDescription className="text-xs">
                        {e.primary_muscles.join(" · ")}
                        {e.equipment ? ` · ${e.equipment}` : ""}
                        {/* Why this row is in the list, when the reason is not
                            its own name. Several terms deliberately return two
                            lifts -- "pushdown", "chest fly", "bss" -- and
                            without this the second one looks like a mistake.
                            On the existing meta line rather than a line of its
                            own: the row keeps its height, so a search still
                            shows as many results on a phone as it did. */}
                        {aliasFor(e) ? ` · “${aliasFor(e)}”` : ""}
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

/** S28. Name, muscle group, equipment. Everything else is optional or absent. */
function CreateStep({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (exercise: Exercise) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>("");
  const [equipment, setEquipment] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await createExercise({
        name,
        muscle_group: group,
        equipment: equipment || null,
      });
      if (res.error || !res.exercise) {
        toast.error(res.error ?? "Could not create that exercise");
        return;
      }
      // Straight into the session: creating an exercise mid-workout is only
      // worth doing because the next thing you want is to log a set of it.
      onCreated(res.exercise);
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

        <Field>
          <FieldLabel htmlFor="exercise_name" className="text-xs font-normal text-muted-foreground">
            Name
          </FieldLabel>
          <Input
            id="exercise_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pendulum squat"
            className="h-11 text-base"
            autoFocus
          />
        </Field>

        <Field className="mt-4">
          <FieldLabel className="text-xs font-normal text-muted-foreground">Muscle group</FieldLabel>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {MUSCLE_GROUPS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field className="mt-4">
          <FieldLabel className="text-xs font-normal text-muted-foreground">Equipment</FieldLabel>
          <Select value={equipment} onValueChange={setEquipment}>
            <SelectTrigger className="h-11 w-full text-base">
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT.map((eq) => (
                <SelectItem key={eq} value={eq}>
                  {eq}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <Button
          className="h-11 w-full text-base"
          onClick={save}
          disabled={pending || name.trim() === "" || group === ""}
        >
          {pending ? "Creating" : "Create and add"}
        </Button>
      </div>
    </div>
  );
}
