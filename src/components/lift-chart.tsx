"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CHART_CLASS, SERIES, TOOLTIP, X_AXIS, Y_AXIS, dayTick, measureDomain } from "@/lib/chart";
import { useFinePointer } from "@/lib/pointer";
import { MIN_LIFT_SESSIONS, hasRepBand, type LiftPoint } from "@/lib/training";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

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
  const hoverable = useFinePointer();
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
          // CONNECTED ACROSS THE HOLES, unlike the raw series on the weight
          // chart and for the same reason the trend there is. A null here is a
          // session with no set in this rep band -- not a session where the
          // lift got weaker, and not a day that did not happen. Strength is the
          // hidden thing each session measures once, so the line between two
          // estimates is the model, and the dots below say which days were
          // actually sessions.
          connectNulls
          dataKey="e1rm"
          type="monotone"
          stroke="var(--color-e1rm)"
          strokeWidth={2.5}
          strokeLinecap="round"
          // Dots ON, unlike the weight chart: a lift has one point per session
          // rather than one per day, so the points are sparse enough to mark and
          // a reader wants to know which days were sessions at all.
          //
          // The compact version keeps them, smaller. It used to drop them to
          // save ink, which was fine while the line broke at every hole and
          // stopped being fine when it started crossing them -- the dots are
          // now the only thing saying which points were measured.
          dot={{ r: compact ? 1.5 : 2, fill: "var(--color-e1rm)", strokeWidth: 0 }}
        />

        {/* A SECOND SERIES, never merged into the first. S33 keeps the bands
            apart because Brzycki means nothing past ~10 reps: a 140 x 30 squat
            estimates above a genuine 315 single, and one line would rate it
            higher. Drawn only where the exercise actually has high-rep work. */}
        {showRepBand && (
          <Line
            {...SERIES}
            connectNulls
            dataKey="repBand"
            type="monotone"
            stroke="var(--color-repBand)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={{ r: compact ? 1.2 : 1.6, fill: "var(--color-repBand)", strokeWidth: 0 }}
          />
        )}

        {/* Rule 3 asks whether the pointer can hover, and this one can. The
            exercise screen lists every session underneath, so on a phone the
            numbers were never behind a gesture. */}
        {hoverable && (
          <ChartTooltip
            {...TOOLTIP}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => dayTick(String(value))}
                formatter={(value, name, item) =>
                  value == null ? null : (
                    <>
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: item.color }}
                      />
                      <span className="text-muted-foreground">
                        {liftConfig[name as keyof typeof liftConfig]?.label ?? name}
                      </span>
                      <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                        {Number(value)} lb
                      </span>
                    </>
                  )
                }
              />
            }
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
