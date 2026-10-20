"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, XAxis, YAxis } from "recharts";
import { CHART_CLASS, X_AXIS, Y_AXIS, countDomain, dayTick } from "@/lib/chart";
import type { TrendPoint } from "@/lib/trends";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/** S83/S84's bars, split from trends-screen.tsx so recharts loads after the page. */
export function DayBars({
  points,
  dataKey,
  goalKey,
  config,
  values,
  goalValues,
}: {
  points: TrendPoint[];
  dataKey: "kcal" | "protein_g";
  goalKey: "calorieGoal" | "proteinGoal";
  config: ChartConfig;
  values: (number | null)[];
  goalValues: (number | null)[];
}) {
  return (
    <ChartContainer config={config} className={`mt-3 ${CHART_CLASS}`}>
      <BarChart data={points} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
        <YAxis
          {...Y_AXIS}
          width={38}
          // The goal line is inside the domain on purpose: above the
          // tallest bar it would otherwise be clipped off the top, and an
          // invisible reference is worse than none.
          domain={countDomain(
            [
              ...values.filter((v): v is number => v !== null),
              ...goalValues.filter((v): v is number => v !== null),
            ],
            dataKey === "kcal" ? 500 : 25,
          )}
        />
        <Bar
          dataKey={dataKey}
          fill={`var(--color-${dataKey})`}
          radius={[3, 3, 0, 0]}
          // No animation, per the contract. A bar chart of a fixed 30-day
          // window has nothing to animate between -- unlike the month
          // pager on Train, nothing here swaps underneath it.
          isAnimationActive={false}
        >
          {/* The window ends today, so the last bar is the unfinished day. */}
          {points.map((p, i) => (
            <Cell key={p.date} fillOpacity={i === points.length - 1 ? 0.45 : 1} />
          ))}
        </Bar>
        {/* Neutral and dashed, never red on the wrong side of it (S79
            rule 5 / S70). The line states where the target is; it does
            not grade the bars against it. Drawn after the bars so it
            sits on top of them rather than under. */}
        <Line
          dataKey={goalKey}
          type="stepAfter"
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
