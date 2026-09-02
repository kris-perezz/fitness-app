"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CHART_CLASS, SERIES, X_AXIS, Y_AXIS, dayTick, measureDomain } from "@/lib/chart";
import { MIN_LIFT_SESSIONS, hasRepBand, type LiftPoint } from "@/lib/training";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/**
 * One lift's estimated max over time (S80), shared by the exercise screen and
 * the pinned block on Progress (S81).
 *
 * EXTRACTED RATHER THAN COPIED. The pinned version is the same chart smaller,
 * and two copies would drift on exactly the detail that matters -- the rep-band
 * series, which is the thing a second implementation always forgets.
 */
const liftConfig = {
  e1rm: { label: "Est. 1RM", color: "var(--primary)" },
  repBand: { label: "High-rep", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function LiftChart({ points, compact = false }: { points: LiftPoint[]; compact?: boolean }) {
  const showRepBand = hasRepBand(points);
  const domain = measureDomain(
    points.flatMap((p) => [p.e1rm, p.repBand]),
    // Pounds, so a pound of air either side is invisible. Five gives the line
    // somewhere to sit without flattening it.
    5,
  );

  return (
    <ChartContainer
      config={liftConfig}
      className={compact ? "mt-3 h-[120px] w-full" : `mt-3 ${CHART_CLASS}`}
    >
      <LineChart data={points} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        {/* The compact version drops the x-axis entirely rather than shrinking
            it. At 120px a date row costs a fifth of the height to restate
            something the block's caption already says, and the full chart is
            one tap away. */}
        {!compact && <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />}
        {/* Fitted, never zero-based: a lift is a measure, not a count (S79
            rule 1), and a 0-300 axis draws a real 20 lb gain as a flat line. */}
        <YAxis domain={domain} {...Y_AXIS} width={38} />

        <Line
          {...SERIES}
          dataKey="e1rm"
          type="monotone"
          stroke="var(--color-e1rm)"
          strokeWidth={2.5}
          strokeLinecap="round"
          // Dots ON, unlike the weight chart: a lift has one point per session
          // rather than one per day, so the points are sparse enough to mark and
          // a reader wants to know which days were sessions at all.
          dot={compact ? false : { r: 2, fill: "var(--color-e1rm)", strokeWidth: 0 }}
        />

        {/* A SECOND SERIES, never merged into the first. S33 keeps the bands
            apart because Brzycki means nothing past ~10 reps: a 140 x 30 squat
            estimates above a genuine 315 single, and one line would rate it
            higher. Drawn only where the exercise actually has high-rep work. */}
        {showRepBand && (
          <Line
            {...SERIES}
            dataKey="repBand"
            type="monotone"
            stroke="var(--color-repBand)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={compact ? false : { r: 1.6, fill: "var(--color-repBand)", strokeWidth: 0 }}
          />
        )}
      </LineChart>
    </ChartContainer>
  );
}

/** Enough sessions to draw at all (S79 rule 4). Shared so both callers agree. */
export function enoughSessions(points: LiftPoint[]): boolean {
  return points.filter((p) => p.e1rm !== null || p.repBand !== null).length >= MIN_LIFT_SESSIONS;
}
