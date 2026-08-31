"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Dumbbell, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  isHardSet,
  suggestFor,
  trim,
  type Exercise,
  type SetDraft,
  type Workout,
  type WorkoutSet,
  type WorkoutSlot,
} from "@/lib/training";
import type { LastSession } from "@/app/train/page";
import {
  addWorkoutExercise,
  currentWorkout,
  deleteSet,
  discardWorkout,
  finishWorkout,
  logSet,
  removeWorkoutExercise,
  updateSet,
} from "@/app/training-actions";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";

/**
 * S22-S28, S43-S46. The gym screen.
 *
 * Button first, form second: an exercise shows the sets already logged, and
 * "Add set" opens a form underneath. Nothing sits on screen half-filled waiting
 * to be confirmed, which was the flaw in the first version -- a pre-filled row
 * plus a careless tap wrote a lift that never happened.
 *
 * What the form OPENS WITH is the suggestion (S45): last session's best set for
 * the opening set of a lift, and the set you just did for every set after it.
 * Shown muted until touched, so it reads as an offer rather than a claim.
 */
export function TrainScreen({
  workout,
  slots,
  lastSessions,
  exercises,
  today,
  recentExerciseIds,
}: {
  workout: Workout | null;
  slots: WorkoutSlot[];
  lastSessions: Record<string, LastSession>;
  exercises: Exercise[];
  today: string;
  recentExerciseIds: string[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  // S26. A session from a previous day is closed rather than resumed, so it
  // cannot absorb today's sets.
  const stale = workout !== null && workout.log_date !== today;

  function run(action: () => Promise<{ error: string | null }>, done?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      done?.();
      router.refresh();
    });
  }

  const hardSets = slots.reduce((n, s) => n + s.sets.filter(isHardSet).length, 0);
  const volume = slots.reduce(
    (v, s) => v + s.sets.filter(isHardSet).reduce((t, x) => t + x.load_lb * (x.reps ?? 0), 0),
    0,
  );

  if (workout === null || stale) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-medium">Train</span>
        </header>

        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Dumbbell />
            </EmptyMedia>
            <EmptyTitle>
              {stale ? "Yesterday's session is still open" : "No session yet"}
            </EmptyTitle>
            <EmptyDescription>
              {stale
                ? "Starting today's session closes it where it stands, so today's sets stay on today."
                : "Start one and add a lift. Each set opens with what you did last time, ready to change or accept."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div className="px-5">
          <Button
            className="h-12 w-full text-base"
            disabled={pending}
            onClick={() => run(async () => ({ error: (await currentWorkout()).error }))}
          >
            {pending ? "Starting" : "Start a session"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-medium">Today&rsquo;s session</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {hardSets} {hardSets === 1 ? "set" : "sets"}
            {volume > 0 && ` · ${Math.round(volume).toLocaleString()} lb`}
          </span>
        </header>

        {slots.length === 0 && (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Dumbbell />
              </EmptyMedia>
              <EmptyTitle>Session is open</EmptyTitle>
              <EmptyDescription>
                Add the first lift. If you have done it before, its numbers come back with it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {slots.map((slot) => (
          <SlotSection
            key={slot.id}
            slot={slot}
            last={lastSessions[slot.id] ?? null}
            onChanged={() => router.refresh()}
          />
        ))}

        <div className="px-5 py-4">
          <Button
            variant="outline"
            className="h-11 w-full text-base"
            onClick={() => setPicking(true)}
          >
            <Plus className="size-4" /> Add exercise
          </Button>
        </div>

        <section className="border-t border-border px-5 py-5">
          <ButtonGroup className="w-full">
            <Button
              variant="outline"
              className="h-11 flex-1"
              disabled={pending}
              onClick={() =>
                run(
                  () => finishWorkout(workout.id),
                  () => toast.success("Session finished"),
                )
              }
            >
              {pending ? "Finishing" : "Finish session"}
            </Button>
            {slots.length === 0 && (
              <Button
                variant="outline"
                size="icon"
                className="h-11 text-destructive"
                aria-label="Discard session"
                disabled={pending}
                onClick={() => run(() => discardWorkout(workout.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </ButtonGroup>
        </section>
      </main>

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        exercises={exercises}
        recentExerciseIds={recentExerciseIds}
        onPick={(exercise) =>
          run(
            () => addWorkoutExercise(workout.id, exercise.id),
            () => setPicking(false),
          )
        }
      />
    </>
  );
}

/** One exercise: the sets already logged as a table, then the Add set control. */
function SlotSection({
  slot,
  last,
  onChanged,
}: {
  slot: WorkoutSlot;
  last: LastSession | null;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestion = suggestFor(slot.sets, last);

  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{slot.name}</h2>
          <p className="text-xs text-muted-foreground">{slot.muscle_group}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label={`Remove ${slot.name}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await removeWorkoutExercise(slot.id);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              onChanged();
            })
          }
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* A real table: these are rows of the same four measurements, which is
          what a table is for, and it keeps the columns aligned down the
          session the way the food list keeps calories aligned. */}
      {slot.sets.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th scope="col" className="w-8 py-1 pl-5 text-left font-normal">
                #
              </th>
              <th scope="col" className="py-1 text-left font-normal">
                Load
              </th>
              <th scope="col" className="py-1 text-left font-normal">
                Reps
              </th>
              <th scope="col" className="py-1 text-left font-normal">
                RIR
              </th>
              <th scope="col" className="w-10 py-1 pr-5">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {slot.sets.map((set) => (
              <tr key={set.id} className="border-t border-border/60">
                <td className="py-2 pl-5 tabular-nums text-muted-foreground">
                  {set.set_index + 1}
                </td>
                <td className="py-2 tabular-nums">
                  {set.load_lb === 0 ? "BW" : `${trim(set.load_lb)} lb`}
                </td>
                <td className="py-2 tabular-nums">{set.reps ?? "—"}</td>
                <td className="py-2 tabular-nums text-muted-foreground">{set.rir ?? "—"}</td>
                <td className="py-2 pr-3 text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit set ${set.set_index + 1}`}
                    onClick={() => setEditing(set)}
                  >
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="px-5 pb-3 pt-2">
          <SetForm
            key={editing.id}
            title={`Set ${editing.set_index + 1}`}
            suggestion={null}
            initial={{ reps: editing.reps, load_lb: editing.load_lb, set_type: editing.set_type }}
            initialRir={editing.rir}
            confirmLabel="Save"
            onCancel={() => setEditing(null)}
            onSubmit={(draft, rir) =>
              startTransition(async () => {
                const res = await updateSet(editing.id, {
                  ...draft,
                  rir,
                  skipped: editing.skipped,
                });
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                setEditing(null);
                onChanged();
              })
            }
            onDelete={() =>
              startTransition(async () => {
                const res = await deleteSet(editing.id);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                setEditing(null);
                onChanged();
              })
            }
          />
        </div>
      )}

      {/* Button first, form second (S46). Collapsible carries the aria-expanded
          wiring and the height animation; the trigger hides while open because
          the form has its own confirm and cancel. */}
      <Collapsible open={adding} onOpenChange={setAdding}>
        <div className={adding ? "hidden" : "px-5 pb-4 pt-2"}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="h-11 w-full">
              <Plus className="size-4" /> Add set
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-5 pb-4 pt-1">
            <SetForm
              // Re-keyed on the set count so each new set opens with a fresh
              // suggestion rather than the previous row's edited state.
              key={slot.sets.length}
              title={`Set ${slot.sets.length + 1}`}
              suggestion={suggestion}
              initial={suggestion?.draft ?? { reps: null, load_lb: 0, set_type: "straight" }}
              initialRir={null}
              confirmLabel="Add set"
              onCancel={() => setAdding(false)}
              onSubmit={(draft, rir) =>
                startTransition(async () => {
                  const res = await logSet(slot.id, {
                    set_index: slot.sets.length,
                    ...draft,
                    rir,
                    skipped: false,
                  });
                  if (res.error) {
                    toast.error(res.error);
                    return;
                  }
                  onChanged();
                })
              }
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/**
 * Load, then reps, then RIR (S43) -- the order the information arrives in: you
 * choose the weight, find out what you got, and only then judge what was left.
 *
 * A suggested value is a REAL value shown muted, not a placeholder. Submitting
 * without touching anything logs the suggestion, which is the point of opening
 * with one; the text goes solid as soon as you edit that field, so the screen
 * distinguishes "offered" from "yours" without a word of explanation.
 */
function SetForm({
  title,
  suggestion,
  initial,
  initialRir,
  confirmLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  title: string;
  suggestion: { from: string; detail: string } | null;
  initial: SetDraft;
  initialRir: number | null;
  confirmLabel: string;
  onSubmit: (draft: SetDraft, rir: number | null) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [load, setLoad] = useState(initial.load_lb === 0 ? "" : trim(initial.load_lb));
  const [reps, setReps] = useState(initial.reps === null ? "" : String(initial.reps));
  const [rir, setRir] = useState(initialRir === null ? "" : String(initialRir));
  const [warmup, setWarmup] = useState(initial.set_type === "warmup");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  /** Muted while it is still the suggestion; solid once it is yours. */
  const tone = (key: string, value: string) =>
    suggestion && !touched[key] && value !== "" ? " text-muted-foreground" : "";

  const edit = (key: string, apply: (v: string) => void) => (v: string) => {
    setTouched((t) => ({ ...t, [key]: true }));
    apply(v);
  };

  const ready = reps.trim() !== "" && Number(reps) > 0;

  function submit() {
    onSubmit(
      {
        reps: reps.trim() === "" ? null : Number(reps),
        // Blank is bodyweight -- a real load of zero (S29), not a missing one.
        load_lb: load.trim() === "" ? 0 : Number(load),
        set_type: warmup ? "warmup" : "straight",
      },
      // Null, not zero: blank is "not recorded", zero is "taken to failure",
      // and collapsing them makes every unlogged set read as a max effort (S24).
      rir.trim() === "" ? null : Number(rir),
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{title}</span>
        {suggestion && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">{suggestion.from}</Badge>
            <span className="tabular-nums">{suggestion.detail}</span>
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <Field className="min-w-0 flex-1 gap-1">
          <FieldLabel
            htmlFor={`load_${title}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Load (lb)
          </FieldLabel>
          <Input
            id={`load_${title}`}
            type="number"
            inputMode="decimal"
            value={load}
            onChange={(e) => edit("load", setLoad)(e.target.value)}
            className={`h-12 text-base tabular-nums${tone("load", load)}`}
            placeholder="BW"
          />
        </Field>
        <Field className="min-w-0 flex-1 gap-1">
          <FieldLabel
            htmlFor={`reps_${title}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Reps
          </FieldLabel>
          <Input
            id={`reps_${title}`}
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => edit("reps", setReps)(e.target.value)}
            className={`h-12 text-base tabular-nums${tone("reps", reps)}`}
            placeholder="—"
          />
        </Field>
        <Field className="w-16 shrink-0 gap-1">
          <FieldLabel
            htmlFor={`rir_${title}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            RIR
          </FieldLabel>
          <Input
            id={`rir_${title}`}
            type="number"
            inputMode="numeric"
            value={rir}
            onChange={(e) => edit("rir", setRir)(e.target.value)}
            className="h-12 text-base tabular-nums"
            placeholder="—"
          />
        </Field>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {/* Warm-ups stay in history but out of volume (S32 / decision 5). */}
        <Toggle
          pressed={warmup}
          onPressedChange={setWarmup}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          Warm-up
        </Toggle>

        <ButtonGroup className="ml-auto">
          {onDelete && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 text-destructive"
              aria-label="Delete this set"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="h-10" disabled={!ready} onClick={submit}>
            <Check className="size-4" /> {confirmLabel}
          </Button>
        </ButtonGroup>
      </div>
    </div>
  );
}
