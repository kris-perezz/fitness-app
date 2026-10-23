"use client";

import { ChevronLeft, Pin, PinOff, TrendingUp } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { pinExercise } from "@/app/progress-actions";
import { reach } from "@/lib/reach";
import {
  dayTitle,
  MIN_LIFT_SESSIONS,
  PLOT_REP_LIMIT,
  REP_CAP,
  hasRepBand,
  setSummary,
  type Exercise,
  type LiftPoint,
  enoughSessions,
  hasLiftValue,
  repsOnly,
  trim,
  type LiftSession,
} from "@/lib/training";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShowMore, usePaged } from "@/components/show-more";
import dynamic from "next/dynamic";
import { CHART_CLASS } from "@/lib/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { PAGE, SURFACE, SURFACE_PAD } from "@/lib/ui";
import { useSwipe } from "@/lib/swipe";
import { toDisplay, type DisplayUnit } from "@/lib/weight";
import { todayDate } from "@/lib/food";
import { useBack } from "@/lib/back";

// Loaded after the page, so the history list never waits on recharts.
const LiftChart = dynamic(() => import("@/components/lift-chart").then((m) => m.LiftChart), {
  ssr: false,
  loading: () => <div className={CHART_CLASS} />,
});

/**
 * One lift's history (S80).
 *
 * The chart shows the shape and the rows underneath show what was actually
 * lifted -- the same division of labour as the weight chart and its list (S57).
 * A chart alone is a claim the reader cannot check; the sets are the evidence.
 *
 * There is no tap-to-inspect on the chart. S79 rules out hover, and the honest
 * alternative it offers is "nothing, whenever the exact numbers are already
 * listed underneath" -- which they are, session by session, below.
 */
export function ExerciseScreen({
  exercise,
  points,
  sessions,
  pinned,
  unit,
}: {
  exercise: Exercise;
  points: LiftPoint[];
  sessions: LiftSession[];
  /** S81. Whether THIS lift is the one on the progress tab. */
  pinned: boolean;
  unit: DisplayUnit;
}) {
  const [pending, startTransition] = useTransition();
  const history = usePaged(sessions);

  /**
   * MANY PINS since 0033, so this adds to the set rather than replacing it.
   * The action takes the id and the state it should end in, which keeps the
   * button a toggle over one lift and never a statement about the others.
   */
  function togglePin() {
    startTransition(async () => {
      const res = await reach(pinExercise(exercise.id, !pinned));
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(pinned ? "Unpinned" : `${exercise.name} pinned to Progress`);
    });
  }

  const plottable = points.filter(hasLiftValue);
  const enough = enoughSessions(points);
  const showRepBand = hasRepBand(points);
  const byReps = repsOnly(points);
  const marks = points.map((p) => (byReps ? p.reps : p.e1rm)).filter((v): v is number => v !== null);
  const show = (v: number) => (byReps ? `${v} reps` : `${trim(toDisplay(v, unit))} ${unit}`);

  // The back arrow in the header, as a gesture. Installed to a home screen
  // there is no browser edge-swipe to fall back on, so a stacked screen that
  // cannot be swiped back can only be left by aiming at the corner.
  const goBack = useBack("/train");
  const back = useSwipe({ onRight: goBack });

  return (
    <main className={cn(PAGE, "touch-pan-y")} {...back}>
      <header className="flex items-center gap-1 px-1 py-1">
        <Button size="icon-xl" variant="ghost" aria-label="Back to training" onClick={goBack}>
            <ChevronLeft className="size-5" />
          </Button>
        <span className="truncate text-sm font-medium">{exercise.name}</span>
        {/* Pushed to the right so it does not sit against the back arrow: it is
            a setting, not part of navigation. */}
        <Button
          size="icon-xl"
          variant="ghost"
          className="ml-auto"
          onClick={togglePin}
          disabled={pending}
          aria-label={pinned ? "Unpin from Progress" : "Pin to Progress"}
          aria-pressed={pinned}
        >
          {pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
        </Button>
      </header>

      {sessions.length === 0 ? (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingUp />
            </EmptyMedia>
            <EmptyTitle>No sets logged yet</EmptyTitle>
            <EmptyDescription>
              Log {exercise.name} in a session and its history collects here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card className={cn(SURFACE, SURFACE_PAD)}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">{byReps ? "Best reps" : "Estimated 1RM"}</h2>
              <span className="text-xs text-muted-foreground">
                {plottable.length} {plottable.length === 1 ? "session" : "sessions"}
              </span>
            </div>

            {marks.length > 0 && (
              <dl className="mt-2 flex gap-6 tabular-nums">
                <div>
                  <dt className="text-xs text-muted-foreground">Current</dt>
                  <dd className="text-lg font-medium">{show(marks[marks.length - 1])}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Best</dt>
                  <dd className="text-lg font-medium">{show(Math.max(...marks))}</dd>
                </div>
              </dl>
            )}

            {!enough ? (
              /* S79 rule 4. Four sessions, because a beginner's lifts climb
                 visibly without a chart and three points is a straight line
                 with an opinion. */
              <p className="mt-2 text-xs text-muted-foreground">
                {plottable.length} of {MIN_LIFT_SESSIONS} sessions needed before this becomes a
                trend. The sets are below in the meantime.
              </p>
            ) : (
              <LiftChart points={points} unit={unit} />
            )}

            {showRepBand && enough && (
              <p className="mt-2 text-xs text-muted-foreground">
                The dashed line is sets of {REP_CAP + 1} to {PLOT_REP_LIMIT} reps, kept separate because an estimated max
                from a long set is not comparable to one from a heavy set.
              </p>
            )}
          </Card>

          <Card className={SURFACE}>
            <ul>
              {history.visible.map((session) => (
                <li key={session.date}>
                  <Item size="sm" className="rounded-none px-3.5 py-3">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{dayTitle(session.date, todayDate())}</ItemTitle>
                      <ItemDescription className="text-xs tabular-nums">
                        {session.sets.map((set) => setSummary(set, unit)).join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </li>
              ))}
            </ul>
            <ShowMore paged={history} />
          </Card>
        </>
      )}
    </main>
  );
}
