"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { WINDOW_BUFFER_MONTHS, WINDOW_MONTHS, shiftMonth, shortDate, trim } from "@/lib/training";
import {
  CHART_WINDOWS,
  DEFAULT_CHART_WINDOW,
  MIN_TREND_ENTRIES,
  axisDomain,
  chartSeries,
  chartWindow,
  chartWindowFrom,
  deltaLabel,
  headline as headlineOf,
  rateLabel,
  weeklyRate,
  windowLabel,
  toDisplay,
  fromDisplay,
  type DisplayUnit,
  type ChartWindowKey,
  type WeighIn,
} from "@/lib/weight";
import { MIN_LOGGED_DAYS, type Adherence, type EnergyWeek } from "@/lib/energy";
import { deleteWeighIn, loadWeighInWindow, saveWeighIn } from "@/app/progress-actions";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CHART_CLASS, SERIES, X_AXIS, Y_AXIS, dayTick } from "@/lib/chart";
import { ConfirmAction } from "@/components/confirm-action";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";

/**
 * S54-S59. The weight log, which is the training log with one number instead of
 * many: headline, calendar, list. Every shape here already exists on the train
 * side and is reused rather than reinvented.
 *
 * The one deliberate divergence, from S57: an EMPTY day is tappable. On the
 * train side an untrained day opens a session because you are about to train;
 * here a day with no entry opens the field because you can reconstruct last
 * Tuesday's weight from a photo of the scale (S55). Back-dating is a first-class
 * path, not a recovery one.
 */
/** S60. Either half may be absent; a rate of 0 is "maintain", not "no goal". */
export type WeightGoal = { weightLb: number | null; rateLbPerWeek: number | null };

export function ProgressHome({
  today,
  loadedFrom,
  earliest,
  entries: initialEntries,
  goal,
  weeks,
  adherence,
  unit,
}: {
  today: string;
  loadedFrom: string;
  /** The first day in the whole log, or null on an empty one. Bounds "All". */
  earliest: string | null;
  entries: WeighIn[];
  goal: WeightGoal;
  /** S63. Computed on the server: it needs the food log, which this tab does not otherwise hold. */
  weeks: EnergyWeek[];
  /** S65. Effort, so a flat trend is not read as a metabolism story. */
  adherence: Adherence;
  /**
   * S69. The unit on SCREEN. Storage is always pounds, so this is applied at
   * every edge -- the field, the list, the headline, the rate and the axis. All
   * of them or none: a screen that mixes units is worse than one in the unit
   * you did not want.
   */
  unit: DisplayUnit;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [from, setFrom] = useState(loadedFrom);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [windowKey, setWindowKey] = useState<ChartWindowKey>(DEFAULT_CHART_WINDOW);
  const [editing, setEditing] = useState<string | null>(null);
  const loading = useRef(false);

  /**
   * The chart's window (S62), as a day. Clamped to the first weigh-in, so
   * picking a year of a three-month log draws three months rather than nine
   * months of white space that reads as weight you failed to record.
   */
  const chartFrom = useMemo(
    () => chartWindowFrom(windowKey, today, earliest),
    [windowKey, today, earliest],
  );

  /**
   * ONE loader, TWO reasons to reach further back, and this is the part S62
   * actually costs.
   *
   * Before S62 the fetched window only ever had to keep ahead of the calendar,
   * so it grew a fixed slab at a time. A window toggle can ask for six years in
   * one tap, and a chart that quietly drew only the loaded six months would be
   * the exact lie this tab is built to avoid -- an axis labelled "All time"
   * over a fifth of the log.
   *
   * So both needs resolve to a month, the earlier wins, and the request goes
   * straight to it rather than a slab at a time: one round trip to 2020 instead
   * of twelve.
   */
  /**
   * DERIVED, not stored: the chart is short exactly when the fetched window
   * does not reach back as far as the chosen one. A boolean set in the effect
   * would be a second copy of that fact, free to disagree with it.
   */
  const chartUnderCovered = chartFrom.slice(0, 7) < from;

  useEffect(() => {
    if (loading.current) return;

    // Extend before the edge, exactly as train-home does. See the comment there
    // for why it is before rather than at.
    const calendarNeed =
      month > shiftMonth(from, WINDOW_BUFFER_MONTHS) ? null : shiftMonth(from, -WINDOW_MONTHS);
    const chartNeed = chartUnderCovered ? chartFrom.slice(0, 7) : null;
    if (!calendarNeed && !chartNeed) return;

    const nextFrom =
      calendarNeed && chartNeed
        ? calendarNeed < chartNeed
          ? calendarNeed
          : chartNeed
        : (calendarNeed ?? chartNeed)!;

    loading.current = true;
    void loadWeighInWindow(nextFrom, shiftMonth(from, -1)).then((res) => {
      loading.current = false;
      if (res.error) return; // Silent: there is just less history on screen.
      setEntries((prev) => [...prev, ...res.entries]);
      setFrom(nextFrom);
    });
  }, [month, from, chartFrom, chartUnderCovered]);

  /**
   * The headline is computed over the WHOLE window, not the month on screen.
   * A trend seeded on the first of the month would restart every month, which
   * is the one thing a trend must not do.
   */
  const head = useMemo(() => headlineOf(entries), [entries]);
  const rate = useMemo(() => weeklyRate(entries, undefined, today), [entries, today]);

  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => e.date.startsWith(month))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, month],
  );

  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);
  const weighedDays = useMemo(() => entries.map((e) => toDate(e.date)), [entries]);

  /**
   * The delta on a row is measured against the previous reading IN TIME, which
   * may be in the month before. Computed off the full sorted log rather than
   * off `monthEntries`, or the first of every month would show no change.
   */
  const previousOf = useMemo(() => {
    const ascending = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<string, number | null>();
    ascending.forEach((e, i) => map.set(e.date, i === 0 ? null : ascending[i - 1].weightLb));
    return map;
  }, [entries]);

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {/* The primary action sits above everything, same as the train tab: the
            thing you came to do is not reachable only by scrolling past what you
            have already done. */}
        <div className="border-b border-border px-5 py-4">
          <Button className="h-12 w-full text-base" onClick={() => setEditing(today)}>
            <Scale className="size-4" /> Weigh in
          </Button>
        </div>

        {/* S67. EVERY BLOCK DEGRADES ON ITS OWN, and the first weigh-in is the
            case where that matters most: with no readings at all, the chart,
            the calendar, the month list, the adherence line and the weekly
            table are six pieces of furniture around an empty room. One
            sentence and the action above it is the honest version of this
            screen -- and the action is already at the top, so the Empty does
            not need to repeat it. */}
        {entries.length === 0 ? (
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Scale />
              </EmptyMedia>
              <EmptyTitle>No weigh-ins yet</EmptyTitle>
              <EmptyDescription>
                Weigh in above and this tab starts answering whether it is working — the trend,
                the rate, and what your calories did against it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
        <Headline head={head} rate={rate} goal={goal} unit={unit} />

        <WeightChart
          entries={entries}
          unit={unit}
          from={chartFrom}
          windowKey={windowKey}
          onWindowChange={setWindowKey}
          extending={chartUnderCovered}
        />

        <ShowedUp adherence={adherence} />

        <EnergyBalance weeks={weeks} unit={unit} />

        <div className="flex justify-center border-b border-border px-2 py-3">
          <Calendar
            month={toDate(`${month}-01`)}
            onMonthChange={(next) => setMonth(monthKey(next))}
            fixedWeeks
            disabled={{ after: toDate(today) }}
            modifiers={{ weighed: weighedDays }}
            modifiersClassNames={{
              weighed: "bg-primary! text-primary-foreground! rounded-md font-medium",
              today: "rounded-md ring-2 ring-ring ring-inset",
            }}
            onSelect={(day) => day && setEditing(dateKey(day))}
            mode="single"
            className="p-0"
          />
        </div>

        {monthEntries.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Scale />
              </EmptyMedia>
              <EmptyTitle>Nothing logged this month</EmptyTitle>
              <EmptyDescription>
                Filled days are days you weighed in. Tap any day up to today —
                including one you missed.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {monthEntries.map((e) => (
              <li key={e.date}>
                <Item size="sm" className="rounded-none px-5 py-3 active:bg-accent">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="font-normal">{shortDate(e.date)}</ItemTitle>
                  </ItemContent>
                  <ItemActions className="shrink-0 gap-3 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => setEditing(e.date)}
                      className="text-left"
                      aria-label={`Edit ${shortDate(e.date)}`}
                    >
                      <span className="text-sm">
                        {trim(toDisplay(e.weightLb, unit))} {unit}
                      </span>{" "}
                      {/* The delta is why the list is worth reading rather than
                          the chart: the chart shows the shape, these are the
                          numbers that made it. Muted, never coloured -- a gain
                          is not a failure and red would say it was (S78). */}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {/* Converted BEFORE the subtraction, not after: a
                            difference of pounds relabelled kg would be wrong by
                            the conversion factor. */}
                        {deltaLabel(
                          toDisplay(e.weightLb, unit),
                          previousOf.get(e.date) != null
                            ? toDisplay(previousOf.get(e.date)!, unit)
                            : null,
                        ) ?? "—"}
                      </span>
                    </button>
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        )}
          </>
        )}
      </main>

      <WeighInSheet
        date={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        existing={editing ? (byDate.get(editing) ?? null) : null}
        unit={unit}
        // Pre-filled with the most recent weight, because the answer is almost
        // always within a pound of it and confirming beats typing. NOT from
        // today's entry when one exists -- that path is an edit and says so.
        suggestion={head?.latest.weightLb ?? null}
        today={today}
        // Applied here and not refetched: saveWeighIn already revalidated the
        // route, so a refresh would re-render it for a fact this screen is
        // holding anyway. Same call as the train tab made when it stopped
        // refreshing after every set action.
        onSaved={(entry) =>
          setEntries((prev) => [...prev.filter((e) => e.date !== entry.date), entry])
        }
        onDeleted={(date) => setEntries((prev) => prev.filter((e) => e.date !== date))}
      />
    </>
  );
}

/**
 * S58/S59. The trend, the reading under it, and the rate.
 *
 * Hand-rolled rather than assembled from the registry, and the reason belongs
 * here per AGENTS.md: there is no stat, metric or figure primitive in the
 * registry -- searched, nothing matched. `Item` is a list row with a title and
 * actions, `Card` is a container rather than a figure, and neither has anything
 * to say about a number that must dominate a second, smaller number beside it.
 * This is three spans and a border.
 *
 * The trend is the headline and the raw reading sits next to it, smaller, never
 * the trend alone: a number the user cannot find on their own scale reads as
 * the app making things up.
 */
function Headline({
  head,
  rate,
  goal,
  unit,
}: {
  head: ReturnType<typeof headlineOf>;
  rate: ReturnType<typeof weeklyRate>;
  goal: WeightGoal;
  unit: DisplayUnit;
}) {
  if (!head) return null;

  // Under the floor there is nothing to smooth, so say what is missing rather
  // than dressing a two-point average up as a trend (S58).
  if (head.trendLb === null) {
    const need = MIN_TREND_ENTRIES - head.entryCount;
    return (
      <section className="border-b border-border px-5 py-4">
        {/* Labelled for the same reason the trend is, and labelled DIFFERENTLY:
            below the floor this is the scale, not a trend, and the two states
            must not look like the same number changing its mind. */}
        <p className="text-xs text-muted-foreground">Last reading</p>
        <p className="text-3xl font-semibold tabular-nums">
          {toDisplay(head.latest.weightLb, unit).toFixed(1)} {unit}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {shortDate(head.latest.date)} · {need} more {need === 1 ? "weigh-in" : "weigh-ins"} and
          this becomes a trend
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-border px-5 py-4">
      {/* The big number is the trend, so it SAYS "trend". Unlabelled, a 163.0
          sitting beside a 161.8 reads as two scale readings and invites the one
          question this tab exists to answer -- which of these am I? The word
          used to be on the third line, attached to the rate, where it labelled
          the wrong number. */}
      <p className="text-xs text-muted-foreground">Trend weight</p>
      {/* Both weights to one decimal. `trim` drops a trailing .0, which printed
          the trend as "163" next to a reading of "161.8" and made two
          measurements of one quantity look like two kinds of number. */}
      <p className="text-3xl font-semibold tabular-nums">
        {toDisplay(head.trendLb, unit).toFixed(1)} {unit}
      </p>
      {rate ? (
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="tabular-nums">{rateLabel(rate, unit)}</span> {windowLabel(rate.days)}
        </p>
      ) : null}
      {/* The reading stays on screen and stays subordinate. Showing the trend
          alone would be a number the user cannot find on their own scale. */}
      <p className="mt-1 text-xs text-muted-foreground">
        Last reading{" "}
        <span className="tabular-nums">{head.latest.weightLb.toFixed(1)} lb</span>
        {" · "}
        {shortDate(head.latest.date)}
      </p>

      {/* S60. The goal SITS BESIDE the rate; it does not grade it. No "on
          track", no "behind", and deliberately no projected date -- compounding
          a noisy rate over months and putting a day on it costs more adherence
          than never offering one. The two numbers next to each other are enough
          for the reader to draw their own conclusion.

          `!= null` throughout: a goal rate of 0 is maintain, and a falsy check
          would hide the one goal most worth showing. */}
      {(goal.rateLbPerWeek != null || goal.weightLb != null) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Goal
          {goal.rateLbPerWeek != null && (
            <>
              {" · "}
              <span className="tabular-nums">
                {rateLabel({ lbPerWeek: goal.rateLbPerWeek, days: 0 }, unit)}
              </span>
            </>
          )}
          {goal.weightLb != null && (
            <>
              {" · "}
              <span className="tabular-nums">{trim(toDisplay(goal.weightLb, unit))} {unit}</span>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/**
 * S54, S55, S56. One number on a decimal keypad, and nothing else required.
 *
 * The same drawer handles all three stories because the primary key does: a
 * date refers to at most one weigh-in, so opening a day that has one is an edit
 * and opening a day that has none is an entry. Delete only appears on the
 * former, because there is nothing to delete on the latter.
 */
function WeighInSheet({
  date,
  existing,
  suggestion,
  today,
  onOpenChange,
  onSaved,
  onDeleted,
  unit,
}: {
  date: string | null;
  existing: WeighIn | null;
  suggestion: number | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (entry: WeighIn) => void;
  onDeleted: (date: string) => void;
  unit: DisplayUnit;
}) {
  const [value, setValue] = useState("");
  const [openedFor, setOpenedFor] = useState<string | null>(date);
  const [pending, startTransition] = useTransition();

  // Reset on every OPEN, and on opening a different day. Adjusted during render
  // rather than in an effect, the same call add-sheet.tsx made and for the same
  // two reasons: an effect paints the stale value for a frame first, and React
  // re-runs this before committing. A leftover weight from the day you looked
  // at last is a wrong number one tap from being saved.
  if (date !== null && date !== openedFor) {
    setOpenedFor(date);
    // Shown in the display unit, and rounded only here -- the stored pound
    // value keeps its precision so a kg round trip lands on what was typed.
    setValue(
      existing
        ? String(round1(toDisplay(existing.weightLb, unit)))
        : suggestion !== null
          ? String(round1(toDisplay(suggestion, unit)))
          : "",
    );
  } else if (date === null && openedFor !== null) {
    setOpenedFor(null);
  }

  function save() {
    if (date === null) return;
    const typed = Number(value);
    if (!Number.isFinite(typed) || typed <= 0) {
      toast.error("Enter a weight");
      return;
    }
    // Straight back to pounds, UNROUNDED. Storage is always lb (S69); rounding
    // here would make 82 kg read back as 81.99 the next time the sheet opened.
    const lb = fromDisplay(typed, unit);
    startTransition(async () => {
      const res = await saveWeighIn(date, lb, existing?.note ?? null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onSaved({ date, weightLb: lb, note: existing?.note ?? null });
      onOpenChange(false);
    });
  }

  function remove() {
    if (date === null) return;
    startTransition(async () => {
      const res = await deleteWeighIn(date);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onDeleted(date);
      onOpenChange(false);
    });
  }

  return (
    <Drawer open={date !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">
            {date === today ? "Today" : date ? shortDate(date) : ""}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Enter the weight for this day.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-5 pb-3">
          <InputGroup>
            <InputGroupInput
              // Decimal keypad, same treatment as the load field and the
              // quantity field -- a number entry in this app looks like a
              // number entry wherever it is.
              inputMode="decimal"
              autoFocus
              className="h-12 text-base tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              // Selected on focus so the first digit replaces the suggestion
              // rather than appending to it, the same fix the load field got.
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0.0"
              aria-label={`Weight in ${unit === "kg" ? "kilograms" : "pounds"}`}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>{unit}</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 pt-3 pb-safe">
          {existing && (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Delete">
                  <Trash2 className="size-4" />
                </Button>
              }
              title="Delete this weigh-in?"
              description="The trend and the rate are recomputed without it."
              onConfirm={remove}
            />
          )}
          <Button className="h-11 flex-1 text-base" onClick={save} disabled={pending || !value}>
            {pending ? "Saving" : existing ? "Save" : "Log it"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * What the calories actually did (S63).
 *
 * Average intake for a week beside what the trend weight did across it. The
 * only thing in this app that a single-purpose tracker cannot do, and the
 * argument for the food log and the scale living together.
 *
 * A TABLE, not a chart. Two numbers a week for eight weeks is a table; drawing
 * it would be decoration, and the comparison is read across a row rather than
 * along an axis.
 *
 * It reports and never prescribes: nothing here writes back to the calorie goal
 * (progress open decision 4). And it does not compute a TDEE figure -- the two
 * observations ARE the answer, and a single derived number would hide which
 * half of it was thin.
 */
/**
 * Effort, stated next to outcome (S65).
 *
 * TWO LINES, NOT A CHART. A bar chart of two numbers is decoration, and these
 * are read once and acted on -- "I logged 8 of the last 14 days" is the whole
 * finding.
 *
 * Placed ABOVE the calories-against-the-scale table on purpose: it is the
 * context that decides how much of that table to believe, and context after the
 * conclusion is a footnote nobody reads.
 *
 * No colour, no target, no praise. Adherence is a fact about the log, not a
 * grade (S70).
 */
function ShowedUp({ adherence }: { adherence: Adherence }) {
  return (
    <section className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
      <span className="text-sm">
        <span className="tabular-nums">
          {adherence.loggedDays} of {adherence.windowDays}
        </span>{" "}
        <span className="text-muted-foreground">days logged</span>
      </span>
      <span className="text-sm">
        <span className="tabular-nums">{adherence.sessionsThisWeek}</span>{" "}
        <span className="text-muted-foreground">
          {adherence.sessionsThisWeek === 1 ? "session" : "sessions"} this week
        </span>
      </span>
    </section>
  );
}

/** One decimal, for a value already converted to the display unit. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A signed change in pounds. `deltaLabel` takes two readings; this takes the difference. */
function signedWeight(change: number, unit: DisplayUnit): string {
  const shown = toDisplay(change, unit);
  if (Math.abs(shown) < 0.05) return `0.0 ${unit}`;
  return `${shown > 0 ? "+" : "−"}${Math.abs(shown).toFixed(1)} ${unit}`;
}

function EnergyBalance({ weeks, unit }: { weeks: EnergyWeek[]; unit: DisplayUnit }) {
  // BOTH halves, not just the food half. A week with five logged days but no
  // pair of weigh-ins has an intake average and no change to set it against,
  // and a column of dashes is not an answer -- it is the shape of one.
  const usable = weeks.filter((w) => w.included && w.changeLb !== null);
  // Nothing to say yet. Rendered as a sentence rather than an empty table,
  // because a table of dashes looks like a fault rather than a beginning.
  if (usable.length === 0) {
    return (
      <section className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-medium">Calories against the scale</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Needs a week with at least {MIN_LOGGED_DAYS} days of food logged and two weigh-ins to
          set it against. An average built on fewer would read as a deficit you did not run.
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-sm font-medium">Calories against the scale</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        What you ate, and what the trend did that week. Nothing here changes your goal.
      </p>

      <ul className="mt-3 divide-y divide-border">
        {weeks.map((week) => (
          <li key={week.weekStart} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-xs text-muted-foreground">{shortDate(week.weekStart)}</span>

            {week.included ? (
              <span className="flex items-baseline gap-3 text-sm tabular-nums">
                <span>{week.avgKcal?.toLocaleString()} cal/day</span>
                <span className="text-muted-foreground">
                  {/* Signed, and never coloured. A pound down is not a win and a
                      pound up is not a failure -- the row states what happened
                      and the reader owns what it means (S70). */}
                  {week.changeLb === null ? "—" : signedWeight(week.changeLb, unit)}
                </span>
              </span>
            ) : (
              /* EXCLUDED, and said so rather than silently skipped. A week that
                 vanished would read as a week that did not happen. */
              <span className="text-xs text-muted-foreground">
                {week.loggedDays} of {MIN_LOGGED_DAYS} days logged
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * S61. The trajectory in one glance: the trend as a line, the readings as light
 * dots behind it. S62 puts the window on a toggle above it.
 *
 * The dots are what make the trend believable. A trend line alone is a claim
 * the reader cannot check against anything, and a chart of the raw series alone
 * is unreadable -- daily bodyweight is several pounds of noise around the fact.
 *
 * This is where recharts finally earns its place. `calorie-ring.tsx` refused it
 * to draw one circle and that call stands; a time series with two series, a
 * fitted axis and real gaps in it is the case the library exists for.
 *
 * The toggle is deliberately unlike the calendar's arrows below it. Two time
 * controls on one screen is the hazard S62 names: labelled pills drive the
 * chart, chevrons drive the calendar, and nobody should read them as one
 * control.
 */
const weightConfig = {
  trendLb: { label: "Trend", color: "var(--primary)" },
  weightLb: { label: "Weighed", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

function WeightChart({
  entries,
  unit,
  from,
  windowKey,
  onWindowChange,
  extending,
}: {
  entries: WeighIn[];
  unit: DisplayUnit;
  from: string;
  windowKey: ChartWindowKey;
  onWindowChange: (key: ChartWindowKey) => void;
  extending: boolean;
}) {
  // Smoothed over the WHOLE log and only then clipped, so the line entering
  // from the left carries its history rather than restarting at the window
  // edge with a fortnight of catching up to do.
  // Converted AFTER smoothing, never before: the EMA is a weighted average, so
  // scaling its inputs or its output gives the same line -- but doing it once
  // at the edge keeps a single place where the unit is applied (S69).
  const points = useMemo(
    () =>
      chartSeries(entries, from).map((p) => ({
        ...p,
        weightLb: p.weightLb === null ? null : toDisplay(p.weightLb, unit),
        trendLb: p.trendLb === null ? null : toDisplay(p.trendLb, unit),
      })),
    [entries, from, unit],
  );
  const domain = useMemo(() => axisDomain(points), [points]);

  // Thin data is a sentence, not a chart (S79). Below the trend floor there is
  // nothing to draw that would not be a two-point line dressed up as a shape,
  // and the headline above already says what is missing.
  if (entries.length < MIN_TREND_ENTRIES) return null;

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{chartWindow(windowKey).title}</h2>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={windowKey}
          // A single ToggleGroup deselects when its active item is pressed
          // again, which would leave the chart with no window at all; ignore
          // the empty value, exactly as the by-amount toggle does.
          onValueChange={(next) => next && onWindowChange(next as ChartWindowKey)}
          aria-label="Chart window"
        >
          {CHART_WINDOWS.map((w) => (
            <ToggleGroupItem key={w.key} value={w.key} className="px-2 text-xs">
              {w.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* While a wider window is still being fetched the chart holds what it
          has, dimmed. Drawing a full-width axis over half the history without
          saying so would present "not loaded yet" as "you did not weigh". */}
      <div className={extending ? "opacity-50 transition-opacity" : "transition-opacity"}>

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

          {/* No ChartTooltip. There is no hover on a phone, and S79 rules out a
              touch tooltip nobody discovers -- the exact numbers are in the
              list underneath, which is the "or nothing" half of that rule. */}

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
            dot={{ r: 1.6, fill: "var(--color-weightLb)", fillOpacity: 0.45, strokeWidth: 0 }}
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
      </div>
    </section>
  );
}

/** Midday, so a timezone offset cannot shunt a date-only string a day either way. */
function toDate(key: string): Date {
  return new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00`);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
