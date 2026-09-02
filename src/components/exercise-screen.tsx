"use client";

import Link from "next/link";
import { ChevronLeft, Pin, PinOff, TrendingUp } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { pinExercise } from "@/app/progress-actions";
import {
  MIN_LIFT_SESSIONS,
  REP_CAP,
  hasRepBand,
  setSummary,
  shortDate,
  type Exercise,
  type LiftPoint,
  type LiftSession,
} from "@/lib/training";
import { Button } from "@/components/ui/button";
import { LiftChart, enoughSessions } from "@/components/lift-chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

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
}: {
  exercise: Exercise;
  points: LiftPoint[];
  sessions: LiftSession[];
  /** S81. Whether THIS lift is the one on the progress tab. */
  pinned: boolean;
}) {
  const [pending, startTransition] = useTransition();

  /**
   * ONE PIN, so pinning this lift replaces whatever was pinned before rather
   * than adding to a list. The action takes an id and overwrites, which makes
   * that the shape of the data rather than a rule the UI has to remember.
   */
  function togglePin() {
    startTransition(async () => {
      const res = await pinExercise(pinned ? null : exercise.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(pinned ? "Unpinned" : `${exercise.name} pinned to Progress`);
    });
  }

  const plottable = points.filter((p) => p.e1rm !== null || p.repBand !== null);
  const enough = enoughSessions(points);
  const showRepBand = hasRepBand(points);

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Button size="icon" variant="ghost" aria-label="Back to training" asChild>
          <Link href="/train">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <span className="truncate text-sm font-medium">{exercise.name}</span>
        {/* Pushed to the right so it does not sit against the back arrow: it is
            a setting, not part of navigation. */}
        <Button
          size="icon"
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
          <section className="border-b border-border px-5 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">Estimated 1RM</h2>
              <span className="text-xs text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
              </span>
            </div>

            {!enough ? (
              /* S79 rule 4. Four sessions, because a beginner's lifts climb
                 visibly without a chart and three points is a straight line
                 with an opinion. */
              <p className="mt-2 text-xs text-muted-foreground">
                {plottable.length} of {MIN_LIFT_SESSIONS} sessions needed before this becomes a
                trend. The sets are below in the meantime.
              </p>
            ) : (
              <LiftChart points={points} />
            )}

            {showRepBand && enough && (
              <p className="mt-2 text-xs text-muted-foreground">
                The dashed line is sets above {REP_CAP} reps, kept separate because an estimated max
                from a long set is not comparable to one from a heavy set.
              </p>
            )}
          </section>

          <ul className="divide-y divide-border">
            {sessions.map((session) => (
              <li key={session.date}>
                <Item size="sm" className="rounded-none px-5 py-3">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="font-normal">{shortDate(session.date)}</ItemTitle>
                    <ItemDescription className="text-xs tabular-nums">
                      {session.sets.map((set) => setSummary(set)).join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
