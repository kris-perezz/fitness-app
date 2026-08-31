"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, Dumbbell, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  allowsBodyweight,
  isHardSet,
  loadLabel,
  shortDate,
  suggestFor,
  trim,
  type Exercise,
  type SetDraft,
  type Workout,
  type WorkoutSet,
  type WorkoutSlot,
} from "@/lib/training";
import type { LastSession } from "@/lib/training";
import {
  addWorkoutExercise,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmAction } from "@/components/confirm-action";
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
  workout: Workout;
  slots: WorkoutSlot[];
  lastSessions: Record<string, LastSession>;
  exercises: Exercise[];
  today: string;
  recentExerciseIds: string[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  // S26. A session left open from a previous day cannot absorb today's sets, so
  // it is closed where it stands rather than continued.
  const stale = workout.ended_at === null && workout.log_date !== today;
  const past = workout.log_date !== today;

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

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-1 border-b border-border px-2 py-2">
          <Button size="icon" variant="ghost" aria-label="All sessions" asChild>
            <Link href="/train">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {past ? shortDate(workout.log_date) : "Today's session"}
          </span>
          <span className="shrink-0 pr-3 text-xs tabular-nums text-muted-foreground">
            {hardSets} {hardSets === 1 ? "set" : "sets"}
            {volume > 0 && ` · ${Math.round(volume).toLocaleString()} lb`}
          </span>
        </header>

        {stale && (
          <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
            Left open from {shortDate(workout.log_date)}. Finishing it keeps its sets on that
            day rather than rolling them into today.
          </p>
        )}

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
            // Looked up rather than denormalised onto the slot: these decide how
            // a form BEHAVES today, not what a past set meant, so they are the
            // things here that follow the catalog rather than freeze at log time.
            exercise={exercises.find((e) => e.id === slot.exercise_id) ?? null}
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
                run(() => finishWorkout(workout.id), () => {
                  toast.success("Session finished");
                  router.push("/train");
                })
              }
            >
              {pending ? "Finishing" : workout.ended_at ? "Done" : "Finish session"}
            </Button>
            {slots.length === 0 && (
              <ConfirmAction
                title="Discard this session?"
                description="Nothing has been logged in it yet, so nothing is lost -- the day simply goes back to being untrained."
                confirmLabel="Discard"
                onConfirm={() => run(() => discardWorkout(workout.id), () => router.push("/train"))}
                trigger={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 text-destructive"
                    aria-label="Discard session"
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                }
              />
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
  exercise,
  onChanged,
}: {
  slot: WorkoutSlot;
  last: LastSession | null;
  /** The catalog row, for the two things that govern how the form behaves. */
  exercise: Exercise | null;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkoutSet | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * The set appears the instant you press the button, not when the server
   * answers. Logging a set is the one interaction that happens standing up with
   * a barbell waiting, and a gym is the worst network you will ever use it on;
   * a round trip before anything moves is felt every single time.
   *
   * The optimistic row is discarded automatically when the transition ends and
   * the refreshed server data arrives, so a failed write corrects itself rather
   * than leaving a set that was never saved.
   */
  const [sets, applyOptimistic] = useOptimistic(
    slot.sets,
    (current: WorkoutSet[], action: { kind: "add"; set: WorkoutSet } | { kind: "remove"; id: string }) =>
      action.kind === "add"
        ? [...current, action.set]
        : current.filter((s) => s.id !== action.id),
  );

  const suggestion = suggestFor(sets, last);

  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{slot.name}</h2>
          <p className="text-xs text-muted-foreground">{slot.muscle_group}</p>
        </div>
        <ConfirmAction
          title={`Remove ${slot.name}?`}
          description={
            sets.length === 0
              ? "Nothing has been logged against it yet."
              : `Its ${sets.length} logged ${sets.length === 1 ? "set goes" : "sets go"} with it. This cannot be undone.`
          }
          confirmLabel="Remove"
          onConfirm={() =>
            startTransition(async () => {
              const res = await removeWorkoutExercise(slot.id);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              onChanged();
            })
          }
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              aria-label={`Remove ${slot.name}`}
              disabled={pending}
            >
              <X className="size-4" />
            </Button>
          }
        />
      </div>

      {/* Rows of the same four measurements, which is what a table is for --
          and it keeps the columns aligned down the session the way the food
          list keeps calories aligned. */}
      {sets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-5">#</TableHead>
              <TableHead>{exercise?.load_is_per_side ? "Load / side" : "Load"}</TableHead>
              <TableHead>Reps</TableHead>
              <TableHead>RIR</TableHead>
              <TableHead className="w-14 pr-3">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sets.map((set) => (
              <TableRow key={set.id}>
                <TableCell className="pl-5 tabular-nums text-muted-foreground">
                  {set.set_index + 1}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">
                      {set.load_lb === 0 ? "BW" : `${trim(set.load_lb)} lb`}
                    </span>
                    {/* A warm-up counts for nothing in volume (S32) but stays in
                        history, so the row has to say which it is -- the light
                        load that would otherwise hint at it is exactly what a
                        warm-up shares with a bad day. */}
                    {set.set_type === "warmup" && (
                      <Badge variant="secondary" className="px-1.5 text-[10px]">
                        Warm-up
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{set.reps ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {set.rir ?? "—"}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {/* 44px, not the 28px an icon-sm gives: this is the app's own
                      floor, stated in bottom-nav.tsx, and it sits on every set. */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-11 text-muted-foreground"
                    aria-label={`Edit set ${set.set_index + 1}`}
                    onClick={() => setEditing(set)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <div className="px-5 pb-3 pt-2">
          <SetForm
            key={editing.id}
            title={`Set ${editing.set_index + 1}`}
            suggestion={null}
            initial={{ reps: editing.reps, load_lb: editing.load_lb, set_type: editing.set_type }}
            initialRir={editing.rir}
            exercise={exercise}
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
                applyOptimistic({ kind: "remove", id: editing.id });
                setEditing(null);
                const res = await deleteSet(editing.id);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
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
              key={sets.length}
              title={`Set ${sets.length + 1}`}
              suggestion={suggestion}
              initial={suggestion?.draft ?? { reps: null, load_lb: 0, set_type: "straight" }}
              initialRir={null}
              exercise={exercise}
              confirmLabel="Add set"
              onCancel={() => setAdding(false)}
              onSubmit={(draft, rir) =>
                startTransition(async () => {
                  const setIndex = sets.length;
                  applyOptimistic({
                    kind: "add",
                    set: {
                      // A temporary id: this row exists only until the server
                      // answers and the refreshed data replaces it.
                      id: `pending-${setIndex}`,
                      workout_exercise_id: slot.id,
                      set_index: setIndex,
                      ...draft,
                      rir,
                      skipped: false,
                    },
                  });
                  const res = await logSet(slot.id, {
                    set_index: setIndex,
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
  exercise,
  confirmLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  title: string;
  suggestion: { from: string; detail: string } | null;
  initial: SetDraft;
  initialRir: number | null;
  exercise: Exercise | null;
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

  // S47. A blank load means BODYWEIGHT, which is true of a pull-up and absurd of
  // a bench press -- so it is only accepted where the exercise says it can be.
  // Everywhere else the load has to be typed, rather than silently logging a
  // barbell lift as though it were lifted with nothing on it.
  const bodyweight = allowsBodyweight(exercise);
  const ready = reps.trim() !== "" && Number(reps) > 0 && (bodyweight || load.trim() !== "");

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
            {loadLabel(exercise)}
          </FieldLabel>
          <Input
            id={`load_${title}`}
            type="number"
            inputMode="decimal"
            value={load}
            onChange={(e) => edit("load", setLoad)(e.target.value)}
            className={`h-12 text-base tabular-nums${tone("load", load)}`}
            // "BW" is an answer, so it is only offered where it is a true one.
            placeholder={bodyweight ? "BW" : "—"}
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
