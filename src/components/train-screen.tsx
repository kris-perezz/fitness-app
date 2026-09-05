"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, Dumbbell, Flame, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  NO_BESTS,
  allowsBodyweight,
  foldBest,
  isWorkingSet,
  loadLabel,
  shortDate,
  prFor,
  prMessage,
  suggestFor,
  trim,
  type Exercise,
  type SetDraft,
  type Workout,
  type WorkoutSet,
  type WorkoutSlot,
} from "@/lib/training";
import type { Bests, LastSession } from "@/lib/training";
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
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Spinner } from "@/components/ui/spinner";
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
  bests,
  exercises,
  today,
  recentExerciseIds,
}: {
  workout: Workout;
  slots: WorkoutSlot[];
  lastSessions: Record<string, LastSession>;
  bests: Record<string, Bests>;
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

  /**
   * Lifts picked but not yet confirmed by the server, by name.
   *
   * useOptimistic resets to [] on its own once the action settles and the new
   * props arrive, which is exactly the handover wanted: the placeholder is
   * replaced by the real slot rather than both being on screen at once.
   */
  const [addingNames, addOptimisticName] = useOptimistic<string[], string>(
    [],
    (current, name) => [...current, name],
  );

  /**
   * Slots being removed, hidden before the server has confirmed it. Same
   * reasoning as addingNames and the same self-clearing behaviour: confirming a
   * removal is a decision already made, so the row should not sit there through
   * a round trip looking like the tap missed.
   */
  const [removingIds, markRemoving] = useOptimistic<string[], string>(
    [],
    (current, id) => [...current, id],
  );

  function run(action: () => Promise<{ error: string | null }>, done?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      done?.();
      // No router.refresh() here. Every action in training-actions.ts calls
      // revalidatePath, and a Server Action that revalidates re-renders the
      // route and ships the new RSC payload in the SAME response -- refreshing
      // again was a second round trip and a second render of a page that had
      // just been rendered.
    });
  }

  const workingSets = slots.reduce((n, s) => n + s.sets.filter(isWorkingSet).length, 0);
  // Every row, warm-ups included. The header counts working sets because that
  // is what the session amounts to; a deletion warning has to count what is
  // actually destroyed, and the cascade takes warm-ups with everything else.
  const allSets = slots.reduce((n, s) => n + s.sets.length, 0);
  const volume = slots.reduce(
    (v, s) => v + s.sets.filter(isWorkingSet).reduce((t, x) => t + x.load_lb * (x.reps ?? 0), 0),
    0,
  );

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-1 border-b border-border px-2 py-2">
          <Button size="icon-xl" variant="ghost" aria-label="All sessions" asChild>
            {/* ?browse=1, because /train sends you back into an open session on
                sight (S26). Without it this chevron would bounce straight here
                again and the calendar would be unreachable mid-workout. */}
            <Link href="/train?browse=1">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {past ? shortDate(workout.log_date) : "Today's session"}
          </span>
          <span className="shrink-0 pr-3 text-xs tabular-nums text-muted-foreground">
            {workingSets} {workingSets === 1 ? "set" : "sets"}
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

        {slots
          .filter((slot) => !removingIds.includes(slot.id))
          .map((slot) => (
          <SlotSection
            key={slot.id}
            slot={slot}
            last={lastSessions[slot.id] ?? null}
            bests={bests[slot.id] ?? NO_BESTS}
            // Looked up rather than denormalised onto the slot: these decide how
            // a form BEHAVES today, not what a past set meant, so they are the
            // things here that follow the catalog rather than freeze at log time.
            exercise={exercises.find((e) => e.id === slot.exercise_id) ?? null}
            onRemoving={markRemoving}
          />
        ))}

        {addingNames.map((name, i) => (
          <PendingSlot key={`${name}_${i}`} name={name} />
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
            {/* Offered whatever is in the session, not only while it is empty.
                It used to appear only for an empty one, which meant a single
                logged set made a session permanent: a mistyped date or a day
                opened by accident could never be removed. The wording carries
                the weight instead -- an empty session says nothing is lost, a
                full one counts out exactly what goes. */}
            <ConfirmAction
              title={allSets === 0 ? "Discard this session?" : "Delete this session?"}
              description={
                allSets === 0
                  ? "Nothing has been logged in it yet, so nothing is lost -- the day simply goes back to being untrained."
                  : `Its ${allSets} ${allSets === 1 ? "set" : "sets"} across ${slots.length} ${
                      slots.length === 1 ? "exercise" : "exercises"
                    } go with it. This cannot be undone.`
              }
              confirmLabel={allSets === 0 ? "Discard" : "Delete"}
              onConfirm={() => run(() => discardWorkout(workout.id), () => router.push("/train"))}
              trigger={
                <Button
                  size="icon-xl"
                  variant="destructive"
                  aria-label={allSets === 0 ? "Discard session" : "Delete session"}
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            />
          </ButtonGroup>
        </section>
      </main>

      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        exercises={exercises}
        recentExerciseIds={recentExerciseIds}
        onPick={(exercise) => {
          // Closed and drawn before the round trip, not after it. Adding a lift
          // is a decision you have already made by the time you tap it; making
          // it wait on the network is what made the app feel slow even once
          // the query behind it was cheap.
          setPicking(false);
          startTransition(async () => {
            addOptimisticName(exercise.name);
            const res = await addWorkoutExercise(workout.id, exercise.id);
            // On failure the placeholder disappears with the transition, which
            // is the honest outcome: the lift was not added.
            if (res.error) toast.error(res.error);
          });
        }}
      />
    </>
  );
}

/**
 * A lift that has been picked but not yet confirmed. Deliberately not a
 * skeleton: the name is already known, so showing it is more honest than
 * showing a grey box, and the spinner says the rest is on its way.
 */
function PendingSlot({ name }: { name: string }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Spinner />
        {name}
      </div>
    </section>
  );
}

/** One exercise: the sets already logged as a table, then the Add set control. */
function SlotSection({
  slot,
  last,
  bests,
  exercise,
  onRemoving,
}: {
  slot: WorkoutSlot;
  last: LastSession | null;
  /** All-time bests for this lift, for S33. Never includes today's sets. */
  bests: Bests;
  /** The catalog row, for the two things that govern how the form behaves. */
  exercise: Exercise | null;
  /** Hide this slot now; the parent clears it when the action settles. */
  onRemoving: (slotId: string) => void;
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
          {/* The name is the way into this lift's history (S80): "is bench
              moving" is asked while looking at bench, and the answer should not
              be on another tab. A link rather than a button because it is
              navigation, and it survives a long-press to open in a new tab. */}
          <h2 className="truncate text-sm font-semibold">
            <Link
              href={`/exercise/${slot.exercise_id}`}
              className="underline-offset-4 hover:underline"
            >
              {slot.name}
            </Link>
          </h2>
          {/* What this lift actually trains, from the log's own classification
              rather than the older single-value column beside it. Two copies of
              one fact drift, and had: the deadlift displayed "Back" while
              counting toward Glutes and Hamstrings. */}
          <p className="text-xs text-muted-foreground">{slot.primary_muscles.join(" · ")}</p>
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
              onRemoving(slot.id);
              const res = await removeWorkoutExercise(slot.id);
              // On failure the row comes back with the transition, which is the
              // honest outcome: it was not removed.
              if (res.error) toast.error(res.error);
            })
          }
          trigger={
            <Button
              size="icon-xl"
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
                    size="icon-xl"
                    variant="ghost"
                    className="text-muted-foreground"
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
              onSubmit={(draft, rir) => {
                // Collapse back to the button before the write, not after it.
                // The form is keyed on `sets.length`, so leaving it open meant
                // the optimistic row remounted it as the NEXT set's form -- the
                // screen jumped straight to "Set 3" instead of coming to rest,
                // which is the half-filled form the design note above rules out.
                setAdding(false);
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

                  // S33. Said at the moment it happens, not buried in a stats
                  // tab -- a best you find out about a week later is a fact,
                  // and a best you are told about mid-session is a reason to
                  // keep showing up. Compared against sets ALREADY LOGGED TODAY
                  // as well, or a second PR in the same session would go unsaid.
                  const beforeToday = sets.reduce(foldBest, bests);
                  const pr = prFor(
                    { ...draft, rir, skipped: false, id: "", workout_exercise_id: slot.id, set_index: setIndex },
                    beforeToday,
                  );
                  if (pr) toast.success(prMessage(pr, slot.name));
                });
              }}
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

  /**
   * A suggestion is a real value sitting in the field, so the caret lands after
   * it and the first digit typed APPENDS -- tapping 8 on a suggested 135 logs
   * 1358. Selecting it on focus makes the first keystroke replace it, which is
   * what "muted until you touch it" already promises visually.
   *
   * Only while it is still the suggestion. Once the value is yours, focusing is
   * how you go back to amend a typo, and wiping it would be its own bug.
   */
  const selectSuggested = (key: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (suggestion && !touched[key]) e.currentTarget.select();
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
        {suggestion && (
          // CardAction, not a sibling span: the header grid grows a second
          // column on its own when this slot is present, so the badge lands
          // right-aligned without a justify-between that the title has to fight.
          <CardAction className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">{suggestion.from}</Badge>
            <span className="tabular-nums">{suggestion.detail}</span>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex items-end gap-2">
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
            onFocus={selectSuggested("load")}
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
            onFocus={selectSuggested("reps")}
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
      </CardContent>

      <CardFooter className="gap-2">
        {/* Warm-ups stay in history but out of volume (S32 / decision 5).
            The registry Toggle's own on-state is `bg-muted` -- the same colour
            as its hover -- which at arm's length on a phone is indistinguishable
            from off, and this control silently decides whether a set counts.
            So the pressed state is filled rather than tinted, and the icon
            swaps to a check: colour alone is not a state indicator when the
            screen is at arm's length, tilted, and sweaty. */}
        <Toggle
          pressed={warmup}
          onPressedChange={setWarmup}
          variant="outline"
          aria-label="Log this as a warm-up set"
          className="h-10 gap-1.5 px-3"
        >
          {warmup ? <Check /> : <Flame />}
          Warm-up
        </Toggle>

        <ButtonGroup className="ml-auto">
          {onDelete && (
            <Button
              size="icon-xl"
              variant="destructive"
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
      </CardFooter>
    </Card>
  );
}
