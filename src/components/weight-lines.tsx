"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { trim } from "@/lib/training";
import type { DisplayUnit } from "@/lib/weight";
import { CHART_CLASS, SERIES, TOOLTIP, X_AXIS, Y_AXIS, dayTick } from "@/lib/chart";
import { useFinePointer } from "@/lib/pointer";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const weightConfig = {
  trendLb: { label: "Trend", color: "var(--primary)" },
  // Strawberry, where the theme has one. The raw readings are the noise the
  // trend is drawn through, and grey noise under a green line left the pink in
  // this app doing nothing but tinting the page behind the chart.
  weightLb: { label: "Weighed", color: "var(--chart-2)" },
} satisfies ChartConfig;

type Point = { date: string; weightLb: number | null; trendLb: number | null };

/** S61's lines, split from progress-home.tsx so recharts loads after the page. */
export function WeightLines({
  points,
  domain,
  goalWeight,
  unit,
}: {
  points: Point[];
  domain: [number, number];
  goalWeight: number | null;
  unit: DisplayUnit;
}) {
  const hoverable = useFinePointer();

  return (
    <ChartContainer config={weightConfig} className={`mt-3 ${CHART_CLASS}`}>
      <LineChart accessibilityLayer data={points} margin={{ left: 0, right: 8, top: 4 }}>
        {/* Horizontal only. Vertical rules would divide a continuous span of
            days into boxes that mean nothing -- there is no week boundary in
            this data, and S58 is built on there not being one. */}
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
        {/* Fitted, never zero-based: a 0-200 axis flattens a real cut into a
            horizontal line. The rule is S79's, applied by axisDomain. */}
        <YAxis domain={domain} {...Y_AXIS} />

        {/* S60. What the trend is MEASURED AGAINST, not a second measurement
            -- thin, dashed and muted so it never reads as a data series.
            No line at all with no goal on file, and nothing else about the
            chart changes; the axis already made room for it above. */}
        {goalWeight !== null && (
          <ReferenceLine
            y={goalWeight}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{
              value: `${trim(goalWeight)} ${unit}`,
              position: "insideTopRight",
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
          />
        )}

        {/* Only where a pointer can hover (S79 rule 3). The list underneath
            is still the route to an exact number, and remains the only one
            on a phone; this saves a mouse the trip. A day with no reading
            shows the trend alone -- the formatter drops the null rather
            than printing a label with nothing beside it. */}
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
                        {weightConfig[name as keyof typeof weightConfig]?.label ?? name}
                      </span>
                      <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                        {trim(Number(value))} {unit}
                      </span>
                    </>
                  )
                }
              />
            }
          />
        )}

        {/* Readings first so the trend paints over them. Dots with no
            connecting line: the raw series is a scatter of observations, and
            joining them would draw the noise the trend exists to remove.

            Held apart from the line by THREE differences at once, because on
            a phone in daylight one is not enough: shape (dots vs a stroke),
            weight (r 1.6 vs a 2.5px line) and opacity. Colour alone failed --
            muted-foreground against primary is a brightness step this theme
            barely renders, so the two series read as one texture. */}
        <Line
          {...SERIES}
          dataKey="weightLb"
          type="monotone"
          stroke="none"
          // The one place a series overrides the contract's `dot: false`, and
          // it is the point of this series: the readings ARE the dots.
          dot={{ r: 1.9, fill: "var(--color-weightLb)", fillOpacity: 0.75, strokeWidth: 0 }}
        />
        <Line
          {...SERIES}
          dataKey="trendLb"
          type="monotone"
          stroke="var(--color-trendLb)"
          strokeWidth={2.5}
          // The trend is the figure and the dots are the ground, so the line
          // keeps its own edge where it crosses a cloud of them rather than
          // dissolving into it.
          strokeLinecap="round"
        />
      </LineChart>
    </ChartContainer>
  );
}
