"use client";

import * as React from "react";
import type { DayButton } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RING_MIN_FRACTION, ringGeometry } from "@/lib/ring";
import type { DayGoal } from "@/lib/goals";

/**
 * S89 (Apple Fitness comparison pass). The month calendar's strict-mode day
 * mark: calories, protein, carbs and fat as four concentric rings, drawn
 * BELOW the date numeral rather than inside it -- the two used to overlap and
 * fought each other at the mark's original size, which the numeral always
 * lost.
 *
 * Geometry comes from `lib/ring.ts`'s `ringGeometry`, the same function
 * `calorie-ring.tsx` calls with `ringCount = 1` -- this is `ringCount = 4`,
 * not a second implementation.
 */

/**
 * Calories outermost, then protein, carbs, fat -- fixed order every day,
 * restated in the legend and in each day's own label, so position carries the
 * identity as much as colour does. Never re-ordered per day.
 *
 * Colour is a SECOND identity channel, not a verdict: each macro keeps the
 * same chart token whether that day ran over or under it, so a ring never
 * turns into a red/green score the way a bar or an arc elsewhere in the app
 * can (S89's "no scored days" rule -- this is what makes the two rules
 * compatible rather than in tension).
 */
const RING_ORDER = [
  { key: "calories", label: "Calories", stroke: "stroke-macro-calories", dot: "bg-macro-calories" },
  { key: "protein", label: "Protein", stroke: "stroke-macro-protein", dot: "bg-macro-protein" },
  { key: "carbs", label: "Carbs", stroke: "stroke-macro-carbs", dot: "bg-macro-carbs" },
  { key: "fat", label: "Fat", stroke: "stroke-macro-fat", dot: "bg-macro-fat" },
] as const;
type RingKey = (typeof RING_ORDER)[number]["key"];

/** The legend above the grid: same order, same tokens, as a row of dots. */
export const RING_LEGEND = RING_ORDER;

/**
 * ~44px mark in a ~48px-wide, 64px-tall cell (see month-log.tsx for the
 * layout arithmetic this size comes from), 4px stroke so four rings read as
 * four rings rather than a smudge, 1.5px clear between one ring and the next.
 */
const MARK_SIZE = 48;
const MARK_STROKE = 4;
const MARK_GAP = 1.5;

/**
 * What one day needs to draw its rings: the totals it actually logged, and
 * the goal they are read against. `goal: null` means no `day_goals` row --
 * a day this feature has nothing to grade, drawn with no rings at all,
 * never as a day scored at zero.
 */
export type DayRingInfo = {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  goal: DayGoal | null;
};

/**
 * A value against its goal, clamped to a fraction of the ring -- and clamped
 * at ZERO true zero, never the floor: this is what lets a day with a goal but
 * nothing logged draw four empty tracks rather than four slivers that would
 * misreport a gap as a measurement.
 */
function fractionOf(value: number, goal: number): number {
  if (goal <= 0 || value <= 0) return 0;
  // Every ring fills to the same place whether the day ran over or under --
  // this mark shows the shape of a month, not thirty scored days.
  return Math.min(1, Math.max(RING_MIN_FRACTION, value / goal));
}

function fractionsOf(info: DayRingInfo | undefined): Record<RingKey, number> | null {
  if (!info?.goal) return null;
  return {
    calories: fractionOf(info.kcal, info.goal.calorie_goal),
    protein: fractionOf(info.protein_g, info.goal.protein_goal_g),
    carbs: fractionOf(info.carb_g, info.goal.carb_goal_g),
    fat: fractionOf(info.fat_g, info.goal.fat_goal_g),
  };
}

/** "Wednesday, September 3: calories 62% of goal, protein 40%, carbs 71%,
 * fat 55%" -- words carry the same identity the ring positions and colours
 * do, so the mark survives a screen reader as well as greyscale. */
function ringsLabel(date: Date, fractions: Record<RingKey, number> | null): string {
  const base = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!fractions) return base;
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  return (
    `${base}: calories ${pct(fractions.calories)} of goal, ` +
    `protein ${pct(fractions.protein)}, carbs ${pct(fractions.carbs)}, fat ${pct(fractions.fat)}`
  );
}

export function DayRingsButton({
  className,
  day,
  modifiers,
  info,
  ...props
}: React.ComponentProps<typeof DayButton> & { info?: DayRingInfo }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const fractions = fractionsOf(info);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toISOString()}
      aria-label={ringsLabel(day.date, fractions)}
      // NUMERAL ABOVE, RING BELOW, stacked rather than stacked-on: the two
      // shared one centre point at the mark's original size and the numeral
      // always lost that fight. A column has room for both because this
      // page's day cell is no longer square (see month-log.tsx).
      className={cn(
        "flex size-full flex-col items-center justify-center gap-0.5 border-0 font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50",
        // A day spilling in from the month either side keeps its rings -- it
        // has food on it and hiding that would misreport the day -- but sits
        // back, so the month on screen is still the thing being read.
        modifiers.outside && "opacity-45",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="text-[11px] leading-none tabular-nums text-muted-foreground">
        {day.date.getDate()}
      </span>
      {fractions && (
        <svg
          aria-hidden
          width={MARK_SIZE}
          height={MARK_SIZE}
          viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
          // The explicit size class is what opts this out of Button's
          // `[&_svg:not([class*='size-'])]:size-4` rule, which would otherwise
          // shrink the whole mark to 16px whatever the width attribute says.
          // Start every ring at 12 o'clock, matching the calorie ring.
          className="size-12 shrink-0 -rotate-90"
        >
          {RING_ORDER.map(({ key, stroke }, i) => {
            const { radius, circumference } = ringGeometry(MARK_SIZE, i, 4, MARK_STROKE, MARK_GAP);
            const fraction = fractions[key];
            return (
              <g key={key}>
                {/* Muted and visible even at a 20% fill -- the track is what
                    keeps a lightly-filled ring reading as a ring rather than
                    fading into a smudge against the card. */}
                <circle
                  cx={MARK_SIZE / 2}
                  cy={MARK_SIZE / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={MARK_STROKE}
                  className="stroke-macro-track"
                />
                {fraction > 0 && (
                  <circle
                    cx={MARK_SIZE / 2}
                    cy={MARK_SIZE / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={MARK_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - fraction)}
                    className={stroke}
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
    </Button>
  );
}
