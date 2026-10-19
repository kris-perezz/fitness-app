"use client";

import { ChevronLeft, ChartNoAxesColumn } from "lucide-react";
import dynamic from "next/dynamic";

import { CHART_CLASS, enoughToPlot } from "@/lib/chart";
import { estimateShare, loggedDays, type IntakeDay, type TopFood, type TrendPoint } from "@/lib/trends";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { PAGE, SURFACE, SURFACE_PAD } from "@/lib/ui";
import { useSwipe } from "@/lib/swipe";
import { useBack } from "@/lib/back";

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

// Loaded after the page, so the header and lists never wait on recharts.
const DayBars = dynamic(() => import("@/components/day-bars").then((m) => m.DayBars), {
  ssr: false,
  loading: () => <div className={`mt-3 ${CHART_CLASS}`} />,
});

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
  topFoods,
}: {
  points: TrendPoint[];
  days: IntakeDay[];
  /** Null means the query failed -- see TopFoods. Empty means nothing logged. */
  topFoods: TopFood[] | null;
}) {
  const logged = loggedDays(days);
  const share = estimateShare(days);

  // The back arrow in the header, as a gesture. Installed to a home screen
  // there is no browser edge-swipe to fall back on, so a stacked screen that
  // cannot be swiped back can only be left by aiming at the corner.
  const goBack = useBack("/log");
  const back = useSwipe({ onRight: goBack });

  return (
    <main className={cn(PAGE, "touch-pan-y")} {...back}>
      <header className="flex items-center gap-1 px-1 py-1">
        <Button size="icon-xl" variant="ghost" aria-label="Back to the log" onClick={goBack}>
            <ChevronLeft className="size-5" />
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
            goalKey="calorieGoal"
            config={calorieConfig}
            /* A day short of the goal is not a verdict, and the last bar is
               usually TODAY, which is unfinished rather than low (S71). */
            thin="A few more logged days and this becomes a pattern."
          />

          <DayChart
            title="Protein a day"
            points={points}
            dataKey="protein_g"
            goalKey="proteinGoal"
            config={proteinConfig}
            thin="A few more logged days and this becomes a pattern."
          />

          <TopFoods foods={topFoods} />

          {/* S86. Stated flat, never coloured or graded: an estimate is a
              legitimate entry (S35), and this is context for how hard to lean
              on the two charts above rather than a score. */}
          {share.entries > 0 && (
            <Card className={cn(SURFACE, SURFACE_PAD)}>
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
            </Card>
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
      <Card className={cn(SURFACE, SURFACE_PAD)}>
        <h2 className="text-sm font-medium">Where the calories went</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Not available right now.
        </p>
      </Card>
    );
  }

  if (foods.length === 0) return null;

  return (
    <Card className={SURFACE}>
      <h2 className="px-3.5 pt-4 text-sm font-medium">Where the calories went</h2>
      <p className="px-3.5 pt-1 text-xs text-muted-foreground">
        Most calories over the last 30 days, whatever the portion size.
      </p>
      <ul className="mt-2">
        {foods.map((food) => (
          <li key={food.key}>
            <Item size="sm" className="rounded-none px-3.5 py-3">
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
    </Card>
  );
}

/**
 * A day-by-day bar chart with its goal drawn as a stepped line over it.
 *
 * BARS, not a line, for the DATA: days are discrete, and a line between
 * Tuesday and Wednesday implies eating in between, which is not a thing that
 * happens on a chart of daily totals (S83). The GOAL is the opposite case --
 * it genuinely holds between the days it did not change, which is what a
 * stepped line says and a bar per day would not.
 *
 * S60. The goal is PER DAY, not one flat number for the window: a change
 * shows as a step where it happened rather than silently redrawing every day
 * before it at the new number. `connectNulls={false}` so a day with no stored
 * goal is a gap in the line, never bridged to a neighbour's value.
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
  goalKey,
  config,
  thin,
}: {
  title: string;
  caption?: string;
  points: TrendPoint[];
  dataKey: "kcal" | "protein_g";
  goalKey: "calorieGoal" | "proteinGoal";
  config: ChartConfig;
  thin: string;
}) {
  const values = points.map((p) => p[dataKey]);
  const goalValues = points.map((p) => p[goalKey]);

  return (
    <Card className={cn(SURFACE, SURFACE_PAD)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>

      {!enoughToPlot(values, MIN_DAYS) ? (
        <p className="mt-2 text-xs text-muted-foreground">{thin}</p>
      ) : (
        <DayBars
          points={points}
          dataKey={dataKey}
          goalKey={goalKey}
          config={config}
          values={values}
          goalValues={goalValues}
        />
      )}
    </Card>
  );
}
