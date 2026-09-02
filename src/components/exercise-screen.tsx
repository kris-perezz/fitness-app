"use client";

import Link from "next/link";
import { ChevronLeft, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CHART_CLASS, SERIES, X_AXIS, Y_AXIS, dayTick, measureDomain } from "@/lib/chart";
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
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
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
const liftConfig = {
  e1rm: { label: "Est. 1RM", color: "var(--primary)" },
  repBand: { label: "High-rep", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function ExerciseScreen({
  exercise,
  points,
  sessions,
}: {
  exercise: Exercise;
  points: LiftPoint[];
  sessions: LiftSession[];
}) {
  const plottable = points.filter((p) => p.e1rm !== null || p.repBand !== null);
  const enough = plottable.length >= MIN_LIFT_SESSIONS;
  const showRepBand = hasRepBand(points);

  const domain = measureDomain(
    points.flatMap((p) => [p.e1rm, p.repBand]),
    // Pounds, so a pound of air either side is invisible. Five gives the line
    // somewhere to sit without flattening it.
    5,
  );

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Button size="icon" variant="ghost" aria-label="Back to training" asChild>
          <Link href="/train">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <span className="truncate text-sm font-medium">{exercise.name}</span>
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
              <ChartContainer config={liftConfig} className={`mt-3 ${CHART_CLASS}`}>
                <LineChart data={points} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
                  {/* Fitted, never zero-based: a lift is a measure, not a count
                      (S79 rule 1), and a 0-300 axis draws a real 20 lb gain as
                      a flat line. */}
                  <YAxis domain={domain} {...Y_AXIS} width={38} />

                  <Line
                    {...SERIES}
                    dataKey="e1rm"
                    type="monotone"
                    stroke="var(--color-e1rm)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    // Dots ON, unlike the weight chart: a lift has one point per
                    // session rather than one per day, so the points are sparse
                    // enough to mark and a reader wants to know which days were
                    // sessions at all.
                    dot={{ r: 2, fill: "var(--color-e1rm)", strokeWidth: 0 }}
                  />

                  {/* A SECOND SERIES, never merged into the first. S33 keeps the
                      bands apart because Brzycki means nothing past ~10 reps: a
                      140 x 30 squat estimates above a genuine 315 single, and
                      one line would rate it higher. Drawn only where the
                      exercise actually has high-rep work. */}
                  {showRepBand && (
                    <Line
                      {...SERIES}
                      dataKey="repBand"
                      type="monotone"
                      stroke="var(--color-repBand)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={{ r: 1.6, fill: "var(--color-repBand)", strokeWidth: 0 }}
                    />
                  )}
                </LineChart>
              </ChartContainer>
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
