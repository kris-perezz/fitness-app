"use client";

import Link from "next/link";
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

/** One lift's estimated max over time (S80), on the exercise screen. */
const liftConfig = {
  e1rm: { label: "Est. 1RM", color: "var(--primary)" },
  repBand: { label: "High-rep", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function LiftChart({ points }: { points: LiftPoint[] }) {
  const showRepBand = hasRepBand(points);
  const hoverable = useFinePointer();
  const domain = measureDomain(
    points.flatMap((p) => [p.e1rm, p.repBand]),
    // Pounds, so a pound of air either side is invisible. Five gives the line
    // somewhere to sit without flattening it.
    5,
  );

  return (
    <ChartContainer config={liftConfig} className={`mt-3 ${CHART_CLASS}`}>
      <LineChart data={points} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
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
          dot={{ r: 2, fill: "var(--color-e1rm)", strokeWidth: 0 }}
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
            dot={{ r: 1.6, fill: "var(--color-repBand)", strokeWidth: 0 }}
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

export type PinnedLift = { id: string; name: string; points: LiftPoint[] };

const LIFT_COLOURS = 4;

/**
 * Estimated max only. The high-rep band is Brzycki past ten reps, which rates a
 * 140 x 30 squat at 720 (S33), and on a chart headed 1RM it reads as one.
 */
function drawable(points: LiftPoint[]): boolean {
  return points.filter((p) => p.e1rm !== null).length >= MIN_LIFT_SESSIONS;
}

/**
 * Every pinned lift on one chart, a colour each (S81).
 *
 * The colour follows the pin, not the drawable set, so a lift keeps its colour
 * when the one pinned before it gains enough sessions to draw.
 */
export function PinnedLiftsChart({ lifts }: { lifts: PinnedLift[] }) {
  const hoverable = useFinePointer();

  const series = lifts.map((lift, i) => ({
    ...lift,
    key: `l${i}`,
    drawn: drawable(lift.points),
    color: `var(--lift-${(i % LIFT_COLOURS) + 1})`,
  }));
  const drawn = series.filter((s) => s.drawn);

  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.name, color: s.color }]),
  );

  // One row per date any lift was trained. Each lift is null on the others'
  // days, and connectNulls carries its line across them.
  const byDate = new Map<string, Record<string, string | number>>();
  for (const s of drawn) {
    for (const p of s.points) {
      if (p.e1rm === null) continue;
      const row = byDate.get(p.date) ?? { date: p.date };
      row[s.key] = p.e1rm;
      byDate.set(p.date, row);
    }
  }
  const rows = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const domain = measureDomain(
    rows.flatMap((row) => drawn.map((s) => (typeof row[s.key] === "number" ? Number(row[s.key]) : null))),
    5,
  );

  return (
    <>
      {drawn.length > 0 ? (
        <ChartContainer config={config} className={`mt-3 ${CHART_CLASS}`}>
          <LineChart data={rows} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
            <YAxis domain={domain} {...Y_AXIS} width={38} />

            {drawn.map((s) => (
              <Line
                key={s.key}
                {...SERIES}
                connectNulls
                dataKey={s.key}
                type="monotone"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2.5}
                strokeLinecap="round"
                dot={{ r: 2, fill: `var(--color-${s.key})`, strokeWidth: 0 }}
              />
            ))}

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
                            {config[String(name)]?.label ?? name}
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
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Not enough sessions yet to draw a trend.
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.drawn ? s.color : "var(--muted-foreground)" }}
            />
            <Link
              href={`/exercise/${s.id}`}
              className={
                s.drawn
                  ? "underline-offset-4 hover:underline"
                  : "text-muted-foreground underline-offset-4 hover:underline"
              }
            >
              {s.name}
            </Link>
            {!s.drawn && (
              <span className="text-xs text-muted-foreground">too few sessions</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
