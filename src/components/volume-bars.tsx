"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { AXIS_TICK, TOOLTIP } from "@/lib/chart";
import { useFinePointer } from "@/lib/pointer";
import type { MuscleVolume } from "@/lib/training";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const volumeConfig = {
  sets: {
    label: "Sets",
    // NOT var(--chart-1). This project's chart ramp is greyscale and carries
    // the SAME value in light and dark -- oklch(0.87 0 0) -- which is a pale
    // grey that all but disappears on a white surface. --primary flips
    // properly between modes, and it is already what the calendar above fills
    // a trained day with, so one colour means "training" on both.
    color: "var(--primary)",
  },
} satisfies ChartConfig;

/** S32's bars, split from train-home.tsx so recharts loads after the page. */
export function VolumeBars({ volume, scale }: { volume: MuscleVolume[]; scale: number }) {
  const hoverable = useFinePointer();

  return (
    <ChartContainer config={volumeConfig} className="mt-2 h-[300px] w-full">
      <BarChart
        accessibilityLayer
        data={volume}
        layout="vertical"
        // Room on the right for the value labels, which sit outside the
        // bar end rather than inside it -- inside, a short bar has nowhere
        // to put its number and a zero has no bar at all.
        margin={{ left: 0, right: 24 }}
      >
        {/* Hidden because every bar is labelled with its own figure. An
            axis AND a number on each bar would be the same information
            twice, and the axis is the half that makes you measure.

            The DOMAIN is not hidden in the same sense: it is fixed across
            months on purpose, so bar length means the same thing in July as
            it does in August. Without it recharts normalised each month to
            itself and three sets filled the width. */}
        <XAxis type="number" dataKey="sets" domain={[0, scale]} hide />
        <YAxis
          dataKey="muscle"
          type="category"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // EVERY tick, not recharts' idea of how many fit. Left to itself
          // it dropped every other label, so eight of the sixteen bars had
          // no name against them.
          interval={0}
          // Wide enough for "Upper back" on ONE line: at 78 it wrapped to
          // two and stopped lining up with its own bar.
          width={92}
          // Set on the tick rather than by className: recharts renders SVG
          // <text>, which a Tailwind font-size class does not reach.
          tick={AXIS_TICK}
        />
        {/* NO TOOLTIP, per the chart contract (S79 rule 3). It used to be
            here "for pointer devices", which is the shape of exception that
            makes a contract mean nothing -- and it was already redundant:
            every bar carries its own figure in the LabelList below, so
            hover had no number left to reveal. */}
        <Bar
          dataKey="sets"
          fill="var(--color-sets)"
          // The DATA END only. Rounding all four corners detaches a bar
          // from the baseline it is measured from and makes short ones look
          // longer than they are; the earlier version's comment said this
          // and its code did not.
          radius={[0, 6, 6, 0]}
          barSize={13}
          // Recharts animates a bar from its previous value to its new one,
          // so switching months slides the bars across rather than cutting.
          // That only works because the chart STAYS MOUNTED -- keying it on
          // the month, or swapping it out while data loads, would restart
          // every bar from zero and turn a transition into a flash.
          //
          // 420ms, not the 1500ms default: at a second and a half you are
          // watching an animation, and the numbers arrive long after you
          // have decided what you wanted to know.
          isAnimationActive
          animationDuration={420}
          animationEasing="ease-out"
        >
          <LabelList
            dataKey="sets"
            position="right"
            offset={6}
            fontSize={11}
            className="fill-muted-foreground tabular-nums"
          />
        </Bar>

        {/* Rule 3, on a pointer that hovers. The LabelList already puts
            every figure on screen, so this is a convenience rather than
            the route to a number -- which is the only footing on which
            the rule allows one at all. A FILL cursor here, not the line
            the time series use: the thing under the pointer is a band. */}
        {hoverable && (
          <ChartTooltip
            {...TOOLTIP}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            content={<ChartTooltipContent hideIndicator />}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
