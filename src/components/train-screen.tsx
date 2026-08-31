"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Dumbbell, Plus, SkipForward, Trash2, X } from "lucide-react";
import {
  isHardSet,
  nextDraft,
  setSummary,
  trim,
  type Exercise,
  type SetDraft,
  type Workout,
  type WorkoutSet,
  type WorkoutSlot,
} from "@/lib/training";
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "sonner";

/**
 * S22-S28. The gym screen.
 *
 * The interaction budget is one tap per set, which is why a set row arrives
 * pre-filled with last session's numbers and is committed with a check rather
 * than a Save button. This is the one place the training UI deliberately
 * differs from the food flow, which submits a form -- standing at a rack with
 * 90 seconds of rest is a different situation from sitting down to log lunch.
 */
export function TrainScreen({
  workout,
  slots,
  prefills,
  exercises,
  today,
  recentExerciseIds,
}: {
  workout: Workout | null;
  slots: WorkoutSlot[];
  prefills: Record<string, SetDraft[]>;
  exercises: Exercise[];
  today: string;
  recentExerciseIds: string[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  // S26. A session from a previous day is closed rather than resumed, so it
  // cannot absorb today's sets. `currentWorkout` does both halves -- close the
  // stale one, open today's -- because they have to happen together.
  const stale = workout !== null && workout.log_date !== today;

  function start() {
    startTransition(async () => {
      const res = await currentWorkout();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function finish() {
    if (!workout) return;
    startTransition(async () => {
      const res = await finishWorkout(workout.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Session finished");
      router.refresh();
    });
  }

  function discard() {
    if (!workout) return;
    startTransition(async () => {
      const res = await discardWorkout(workout.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const hardSets = slots.reduce((n, s) => n + s.sets.filter(isHardSet).length, 0);

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
            <EmptyTitle>{stale ? "Yesterday's session is still open" : "No session yet"}</EmptyTitle>
            <EmptyDescription>
              {stale
                ? "Starting today's session closes it where it stands, so today's sets stay on today."
                : "Start one and add a lift. Every set arrives filled in with what you did last time — change it or confirm it."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div className="px-5">
          <Button className="h-12 w-full text-base" onClick={start} disabled={pending}>
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
            {hardSets} hard {hardSets === 1 ? "set" : "sets"}
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
                Add the first lift. If you have done it before, its sets come back pre-filled.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {slots.map((slot) => (
          <SlotSection
            key={slot.id}
            slot={slot}
            prefill={prefills[slot.id] ?? []}
            onChanged={() => router.refresh()}
          />
        ))}

        {/* S44. A button, not a full-bleed strip. The food log gets away with a
            strip because there it genuinely is the last row of that meal's
            list; here the same shape would sit under a list of SETS and mean
            something else entirely. */}
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
              onClick={finish}
              disabled={pending}
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
                onClick={discard}
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
          startTransition(async () => {
            const res = await addWorkoutExercise(workout.id, exercise.id);
            if (res.error) {
              toast.error(res.error);
              return;
            }
            setPicking(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

/** One exercise slot: its confirmed sets, then the next row waiting to be done. */
function SlotSection({
  slot,
  prefill,
  onChanged,
}: {
  slot: WorkoutSlot;
  prefill: SetDraft[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await removeWorkoutExercise(slot.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{slot.name}</h2>
          <p className="text-xs text-muted-foreground">
            {slot.muscle_group}
            {prefill.length > 0 && slot.sets.length === 0 && " · filled in from last time"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          aria-label={`Remove ${slot.name}`}
          disabled={pending}
          onClick={remove}
        >
          <X className="size-4" />
        </Button>
      </div>

      {slot.sets.length > 0 && (
        <ul>
          {slot.sets.map((set) => (
            <ConfirmedSet key={set.id} set={set} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <DraftRow slot={slot} prefill={prefill} onChanged={onChanged} />
    </section>
  );
}

/** A set already logged. Tapping it reopens it for correction. */
function ConfirmedSet({ set, onChanged }: { set: WorkoutSet; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await deleteSet(set.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  if (editing) {
    return (
      <li className="px-5 py-2">
        <SetFields
          initial={{ reps: set.reps, load_lb: set.load_lb, set_type: set.set_type }}
          initialRir={set.rir}
          busy={pending}
          confirmLabel="Save"
          onCancel={() => setEditing(false)}
          onConfirm={(values, rir) =>
            startTransition(async () => {
              const res = await updateSet(set.id, { ...values, rir, skipped: set.skipped });
              if (res.error) {
                toast.error(res.error);
                return;
              }
              setEditing(false);
              onChanged();
            })
          }
        />
      </li>
    );
  }

  return (
    <li>
      <Item size="sm" className="rounded-none px-5 py-2">
        <ItemContent className="min-w-0">
          <ItemTitle className="font-normal tabular-nums">
            {set.set_index + 1}. {setSummary(set)}
          </ItemTitle>
          {set.set_type !== "straight" && (
            <ItemDescription className="text-xs">
              <Badge variant="secondary">{set.set_type}</Badge>
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions className="shrink-0">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            aria-label={`Delete set ${set.set_index + 1}`}
            disabled={pending}
            onClick={remove}
          >
            <Trash2 className="size-4" />
          </Button>
        </ItemActions>
      </Item>
    </li>
  );
}

/**
 * The next set, pre-filled and waiting for a check (S22/S23). It is a draft in
 * the browser and not a row in the database, which is what makes "confirmed"
 * and "row exists" the same fact rather than two facts to keep in sync.
 */
function DraftRow({
  slot,
  prefill,
  onChanged,
}: {
  slot: WorkoutSlot;
  prefill: SetDraft[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const draft = nextDraft(slot.sets, prefill);
  const setIndex = slot.sets.length;

  function commit(values: SetDraft, rir: number | null, skipped: boolean) {
    startTransition(async () => {
      const res = await logSet(slot.id, { set_index: setIndex, ...values, rir, skipped });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="px-5 py-2 pb-3">
      <SetFields
        // Re-keyed per set so confirming one row hands the next a fresh set of
        // inputs rather than the previous row's edited state.
        key={setIndex}
        initial={draft}
        initialRir={null}
        busy={pending}
        confirmLabel="Log set"
        setIndex={setIndex}
        onSkip={(values) => commit(values, null, true)}
        onConfirm={(values, rir) => commit(values, rir, false)}
      />
    </div>
  );
}

/**
 * Reps, load and RIR on numeric keypads, with the same
 * `h-12 text-base tabular-nums` treatment as the food quantity field -- 16px
 * inputs are what stop iOS zooming on focus.
 */
function SetFields({
  initial,
  initialRir,
  busy,
  confirmLabel,
  setIndex,
  onConfirm,
  onSkip,
  onCancel,
}: {
  initial: SetDraft;
  initialRir: number | null;
  busy: boolean;
  confirmLabel: string;
  setIndex?: number;
  onConfirm: (values: SetDraft, rir: number | null) => void;
  onSkip?: (values: SetDraft) => void;
  onCancel?: () => void;
}) {
  const [reps, setReps] = useState(initial.reps === null ? "" : String(initial.reps));
  const [load, setLoad] = useState(initial.load_lb === 0 ? "" : trim(initial.load_lb));
  const [rir, setRir] = useState(initialRir === null ? "" : String(initialRir));

  const values = (): SetDraft => ({
    reps: reps.trim() === "" ? null : Number(reps),
    // Blank is bodyweight, which is a real load of zero rather than a missing
    // one -- the opposite of RIR below (S24/S29).
    load_lb: load.trim() === "" ? 0 : Number(load),
    set_type: initial.set_type,
  });

  // Null, not zero: blank means "not recorded", zero means "taken to failure",
  // and collapsing them would make every unlogged set read as a max effort.
  const rirValue = () => (rir.trim() === "" ? null : Number(rir));

  const ready = reps.trim() !== "" && Number(reps) > 0;
  const id = setIndex ?? "edit";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        {setIndex !== undefined && (
          <span className="pb-3 text-sm tabular-nums text-muted-foreground">{setIndex + 1}.</span>
        )}
        {/* S43. Load, then reps, then RIR -- the order the information actually
            arrives in. You pick the weight, then find out what you got, and
            only then judge how much was left in the tank. */}
        <Field className="min-w-0 flex-1 gap-1">
          <FieldLabel
            htmlFor={`load_${id}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Load (lb)
          </FieldLabel>
          <Input
            id={`load_${id}`}
            type="number"
            inputMode="decimal"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            className="h-12 text-base tabular-nums"
            // Blank reads as bodyweight, which is what load_lb = 0 means (S29),
            // rather than as a number nobody supplied.
            placeholder="BW"
          />
        </Field>
        <Field className="min-w-0 flex-1 gap-1">
          <FieldLabel
            htmlFor={`reps_${id}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            Reps
          </FieldLabel>
          <Input
            id={`reps_${id}`}
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="h-12 text-base tabular-nums"
            placeholder="—"
          />
        </Field>
        <Field className="w-16 shrink-0 gap-1">
          <FieldLabel
            htmlFor={`rir_${id}`}
            className="text-[11px] font-normal text-muted-foreground"
          >
            RIR
          </FieldLabel>
          <Input
            id={`rir_${id}`}
            type="number"
            inputMode="numeric"
            value={rir}
            onChange={(e) => setRir(e.target.value)}
            className="h-12 text-base tabular-nums"
            placeholder="—"
          />
        </Field>
      </div>

      {/* S44. The actions carry words. A tick and a skip glyph side by side are
          two different writes distinguished only by iconography, which is a
          guess rather than an affordance -- and a guess is a poor thing to hand
          someone with a barbell waiting. */}
      <ButtonGroup className="w-full">
        <Button
          className="h-11 flex-1"
          disabled={busy || !ready}
          onClick={() => onConfirm(values(), rirValue())}
        >
          <Check className="size-4" /> {confirmLabel}
        </Button>
        {onSkip && (
          <Button
            variant="outline"
            className="h-11 text-muted-foreground"
            disabled={busy}
            onClick={() => onSkip(values())}
          >
            <SkipForward className="size-4" /> Skip
          </Button>
        )}
        {onCancel && (
          <Button variant="outline" className="h-11" disabled={busy} onClick={onCancel}>
            <X className="size-4" /> Cancel
          </Button>
        )}
      </ButtonGroup>
    </div>
  );
}
