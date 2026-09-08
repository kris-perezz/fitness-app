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
  {
    key: "calories",
    label: "Calories",
    color: "var(--macro-calories)",
    dot: "bg-macro-calories",
  },
  {
    key: "protein",
    label: "Protein",
    color: "var(--macro-protein)",
    dot: "bg-macro-protein",
  },
  {
    key: "carbs",
    label: "Carbs",
    color: "var(--macro-carbs)",
    dot: "bg-macro-carbs",
  },
  { key: "fat", label: "Fat", color: "var(--macro-fat)", dot: "bg-macro-fat" },
] as const;
type RingKey = (typeof RING_ORDER)[number]["key"];

/** How far back a lap sits once a second one is wound over it. */
const DEPTH = "15%";

/** The empty groove, the same on every ring. */
const TRACK = "var(--macro-track)";

/**
 * FLAT ARCS, NO SWEEP. A gradient that travels around a circumference is what
 * Apple's rings do and what this drew for a while, via a conic gradient masked
 * into a ring -- SVG has no angular gradient, so that was the only way to get
 * one without cutting every arc into a few dozen segments.
 *
 * It is off because there is not enough arc here for depth to read as depth.
 * At 48px across, four rings deep, a 3px stroke, the shading landed as noise:
 * a hard seam at twelve o'clock where the sweep wrapped, and a cap that had to
 * be drawn as a separate dot because a mask has no `strokeLinecap`. Apple's
 * grid rings are about twice this across and there are three of them.
 */
function shades(color: string) {
  return {
    lit: color,
    /** The lap underneath, once there is one over it. */
    dimmed: `color-mix(in oklch, ${color}, var(--macro-under) ${DEPTH})`,
  };
}

/**
 * The coil's edge, where a second lap crosses the first. Two flat shades meet
 * cleanly enough at the tail but not under the leading cap, where they are the
 * same colour on both sides of the join.
 */
const OVER_SHADOW = "drop-shadow(0 0 1.5px rgb(0 0 0 / 0.55))";

/** The legend above the grid: same order, same tokens, as a row of dots. */
export const RING_LEGEND = RING_ORDER;

/**
 * A 48px mark in a 52px-wide, 68px-tall cell -- see month-log.tsx for the
 * layout arithmetic that size comes from.
 *
 * The stroke is what four rings have to be paid for out of 24px of radius,
 * and the innermost ring is what a thick one costs: at 4px and a 1.5px gap it
 * had a 7px hole, which is not a ring but a dot with a dimple. 3px and a 1px
 * gap opens that to 18px and still leaves the outer ring landing exactly on
 * the mark's edge -- 22.5 + 1.5 = 24.
 */
const MARK_SIZE = 48;
const MARK_STROKE = 3;
const MARK_GAP = 1;

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
 * A value against its goal, as a ratio free to pass 1 -- and pinned to ZERO at
 * a true zero, never to the floor: this is what lets a day with a goal but
 * nothing logged draw four empty tracks rather than four slivers that would
 * misreport a gap as a measurement.
 */
function ratioOf(value: number, goal: number): number {
  if (goal <= 0 || value <= 0) return 0;
  return Math.max(RING_MIN_FRACTION, value / goal);
}

function ratiosOf(info: DayRingInfo | undefined): Record<RingKey, number> | null {
  if (!info?.goal) return null;
  return {
    calories: ratioOf(info.kcal, info.goal.calorie_goal),
    protein: ratioOf(info.protein_g, info.goal.protein_goal_g),
    carbs: ratioOf(info.carb_g, info.goal.carb_goal_g),
    fat: ratioOf(info.fat_g, info.goal.fat_goal_g),
  };
}

/** "Wednesday, September 3: calories 62% of goal, protein 40%, carbs 71%,
 * fat 55%" -- words carry the same identity the ring positions and colours
 * do, so the mark survives a screen reader as well as greyscale. Uncapped,
 * and the only place the exact size of an overshoot is stated: the mark itself
 * stops separating them once the second lap is round. */
function ringsLabel(date: Date, ratios: Record<RingKey, number> | null): string {
  const base = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!ratios) return base;
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  return (
    `${base}: calories ${pct(ratios.calories)} of goal, ` +
    `protein ${pct(ratios.protein)}, carbs ${pct(ratios.carbs)}, fat ${pct(ratios.fat)}`
  );
}

/** One arc, from twelve o'clock clockwise, with a round end at each stop. */
function Arc({
  radius,
  circumference,
  fraction,
  color,
  coiled = false,
}: {
  /** Centre of the stroke, as `ringGeometry` returns it. */
  radius: number;
  circumference: number;
  /** How far round, 0 to 1. */
  fraction: number;
  color: string;
  /** A lap wound over one already full, which needs an edge to sit on. */
  coiled?: boolean;
}) {
  return (
    <circle
      cx={MARK_SIZE / 2}
      cy={MARK_SIZE / 2}
      r={radius}
      fill="none"
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={circumference * (1 - fraction)}
      stroke={color}
      style={coiled ? { filter: OVER_SHADOW } : undefined}
    />
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

  const ratios = ratiosOf(info);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toISOString()}
      aria-label={ringsLabel(day.date, ratios)}
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
      {ratios && (
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
          {RING_ORDER.map(({ key, color }, i) => {
            const { radius, circumference } = ringGeometry(
              MARK_SIZE,
              i,
              RING_ORDER.length,
              MARK_STROKE,
              MARK_GAP,
            );
            const { lit, dimmed } = shades(color);
            const ratio = ratios[key];
            // Under the goal the arc is the whole reading. At or past it the
            // ring is full and the reading moves to the lap wound ON TOP of
            // it, so a day that overshot cannot be read as one that landed
            // exactly on target.
            const fill = Math.min(1, ratio);
            const over = Math.min(1, Math.max(0, ratio - 1));
            const arc = { radius, circumference };
            return (
              <React.Fragment key={key}>
                {/* Neutral, and the same groove on all four rings: a tinted
                    one reads as a fifth value on the day rather than as the
                    absence of this one. Position is what says which macro an
                    empty ring belongs to. */}
                <Arc {...arc} fraction={1} color={TRACK} />
                {fill > 0 && <Arc {...arc} fraction={fill} color={over > 0 ? dimmed : lit} />}
                {over > 0 && <Arc {...arc} fraction={over} color={lit} coiled />}
              </React.Fragment>
            );
          })}
        </svg>
      )}
    </Button>
  );
}
