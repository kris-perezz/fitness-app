"use client";

import Link from "next/link";
import { ChevronLeft, ChartNoAxesColumn } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  CHART_CLASS,
  X_AXIS,
  Y_AXIS,
  countDomain,
  dayTick,
  enoughToPlot,
} from "@/lib/chart";
import { estimateShare, loggedDays, type IntakeDay, type TopFood, type TrendPoint } from "@/lib/trends";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

/**
 * The Food tab's Trends view (S83-S86). What a month of eating looks like,
 * rather than what today looks like.
 *
 * Reached from the Food header the way Recipes is: `bottom-nav.tsx` gives Food
 * no second tab, and a Trends screen is not a fifth destination in a four-tab
 * app.
 *
 * ONE SCROLL, not tabs. Three of the four things here answer one question in
 * sequence -- what did the month look like, where did the calories go, how much
 * of it was guessed -- and putting them behind tabs would hide the answer
 * behind the question.
 *
 * Calm by default (S70): a day over goal is the same colour as a day under it.
 * The reference line carries the comparison, and nothing here is painted
 * `destructive` -- there is no health limit on this screen, and the one place
 * the app does paint one is sodium (S73).
 */

/** Below this a chart is a sentence rather than a picture (S79 rule 4). */
const MIN_DAYS = 5;

const calorieConfig = {
  kcal: { label: "Calories", color: "var(--primary)" },
} satisfies ChartConfig;

const proteinConfig = {
  protein_g: { label: "Protein", color: "var(--primary)" },
} satisfies ChartConfig;

export function TrendsScreen({
  points,
  days,
  calorieGoal,
  proteinGoal,
  topFoods,
}: {
  points: TrendPoint[];
  days: IntakeDay[];
  calorieGoal: number | null;
  proteinGoal: number | null;
  /** Null means the query failed -- see TopFoods. Empty means nothing logged. */
  topFoods: TopFood[] | null;
}) {
  const logged = loggedDays(days);
  const share = estimateShare(days);

  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        <Button size="icon" variant="ghost" aria-label="Back to the log" asChild>
          <Link href="/log">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <span className="text-sm font-medium">Trends</span>
      </header>

      {logged === 0 ? (
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartNoAxesColumn />
            </EmptyMedia>
            <EmptyTitle>Nothing logged in the last 30 days</EmptyTitle>
            <EmptyDescription>
              Log a few days of food and this becomes the shape of your month.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DayChart
            title="Calories a day"
            caption={`${logged} of the last 30 days logged`}
            points={points}
            dataKey="kcal"
            config={calorieConfig}
            goal={calorieGoal}
            goalLabel="Goal"
            /* A day short of the goal is not a verdict, and the last bar is
               usually TODAY, which is unfinished rather than low (S71). */
            thin="A few more logged days and this becomes a pattern."
          />

          <DayChart
            title="Protein a day"
            caption={proteinGoal ? `Floor ${Math.round(proteinGoal)} g` : undefined}
            points={points}
            dataKey="protein_g"
            config={proteinConfig}
            goal={proteinGoal}
            goalLabel="Floor"
            thin="A few more logged days and this becomes a pattern."
          />

          <TopFoods foods={topFoods} />

          {/* S86. Stated flat, never coloured or graded: an estimate is a
              legitimate entry (S35), and this is context for how hard to lean
              on the two charts above rather than a score. */}
          {share.entries > 0 && (
            <section className="border-b border-border px-5 py-4">
              <p className="text-sm">
                <span className="font-medium tabular-nums">{share.percent}%</span> of the{" "}
                <span className="tabular-nums">{share.entries}</span>{" "}
                {share.entries === 1 ? "entry" : "entries"} in the last 30 days{" "}
                {share.estimates === 1 ? "was an estimate" : "were estimates"}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                An estimate is something you typed in yourself, with no food from the catalog
                behind it. It says how hard to lean on the numbers above, not that anything is
                wrong with them.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Where the calories went (S85).
 *
 * A LIST, not a chart. "Rice, 4,200 cal across 31 entries" changes behaviour; a
 * pie of the same rows does not, and a pie of forty foods is unreadable anyway.
 *
 * Ranked by SUM, which is the whole point: the useful surprise is usually a
 * small food eaten constantly rather than a big one eaten once, and that is
 * exactly what a ranking by portion size hides.
 *
 * Sits under the charts because it is what you read after seeing the shape and
 * asking "why".
 */
function TopFoods({ foods }: { foods: TopFood[] | null }) {
  // The query failed, which today means `top_foods` (0023) has not been run
  // yet. Said plainly rather than rendered as an empty list -- "no foods" and
  // "could not ask" are different facts and only one of them is about eating.
  if (foods === null) {
    return (
      <section className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-medium">Where the calories went</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Not available right now.
        </p>
      </section>
    );
  }

  if (foods.length === 0) return null;

  return (
    <section className="border-b border-border py-4">
      <h2 className="px-5 text-sm font-medium">Where the calories went</h2>
      <p className="px-5 pt-1 text-xs text-muted-foreground">
        Most calories over the last 30 days, whatever the portion size.
      </p>
      <ul className="mt-2 divide-y divide-border">
        {foods.map((food) => (
          <li key={food.key}>
            <Item size="sm" className="rounded-none px-5 py-3">
              <ItemContent className="min-w-0">
                <ItemTitle className="font-normal">{food.name}</ItemTitle>
                <ItemDescription className="text-xs tabular-nums">
                  {food.entries} {food.entries === 1 ? "entry" : "entries"} ·{" "}
                  {Math.round(food.kcal_per_entry).toLocaleString()} cal each
                </ItemDescription>
              </ItemContent>
              <span className="shrink-0 text-sm tabular-nums">
                {Math.round(food.kcal).toLocaleString()}
              </span>
            </Item>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A day-by-day bar chart with its goal as a dashed reference.
 *
 * BARS, not a line: days are discrete, and a line between Tuesday and Wednesday
 * implies eating in between, which is not a thing that happens on a chart of
 * daily totals (S83).
 *
 * The axis is zero-based because calories and grams in a day are TOTALS, where
 * zero is a real value with a meaning -- the opposite of the bodyweight rule,
 * and both halves of S79's rule 1 are now exercised in this app.
 */
function DayChart({
  title,
  caption,
  points,
  dataKey,
  config,
  goal,
  goalLabel,
  thin,
}: {
  title: string;
  caption?: string;
  points: TrendPoint[];
  dataKey: "kcal" | "protein_g";
  config: ChartConfig;
  goal: number | null;
  goalLabel: string;
  thin: string;
}) {
  const values = points.map((p) => p[dataKey]);

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>

      {!enoughToPlot(values, MIN_DAYS) ? (
        <p className="mt-2 text-xs text-muted-foreground">{thin}</p>
      ) : (
        <ChartContainer config={config} className={`mt-3 ${CHART_CLASS}`}>
          <BarChart data={points} margin={{ left: 0, right: 8, top: 4 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayTick} />
            <YAxis
              {...Y_AXIS}
              width={38}
              // The goal is inside the domain on purpose: a reference line
              // above the tallest bar would otherwise be clipped off the top,
              // and an invisible reference is worse than none.
              domain={countDomain(
                [...values.filter((v): v is number => v !== null), ...(goal ? [goal] : [])],
                dataKey === "kcal" ? 500 : 25,
              )}
            />
            {goal !== null && (
              /* Neutral and dashed, never red on the wrong side of it (S79
                 rule 5 / S70). The line states where the target is; it does
                 not grade the bars against it. */
              <ReferenceLine
                y={goal}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: goalLabel,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}
            <Bar
              dataKey={dataKey}
              fill={`var(--color-${dataKey})`}
              radius={[3, 3, 0, 0]}
              // No animation, per the contract. A bar chart of a fixed 30-day
              // window has nothing to animate between -- unlike the month
              // pager on Train, nothing here swaps underneath it.
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
