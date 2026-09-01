"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { WINDOW_BUFFER_MONTHS, WINDOW_MONTHS, shiftMonth, shortDate, trim } from "@/lib/training";
import {
  MIN_TREND_ENTRIES,
  deltaLabel,
  headline as headlineOf,
  rateLabel,
  weeklyRate,
  windowLabel,
  type WeighIn,
} from "@/lib/weight";
import { deleteWeighIn, loadWeighInWindow, saveWeighIn } from "@/app/progress-actions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  entries: initialEntries,
  goal,
}: {
  today: string;
  loadedFrom: string;
  entries: WeighIn[];
  goal: WeightGoal;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [from, setFrom] = useState(loadedFrom);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const loading = useRef(false);

  // Extend before the edge, exactly as train-home does. See the comment there
  // for why it is before rather than at.
  useEffect(() => {
    if (loading.current) return;
    if (month > shiftMonth(from, WINDOW_BUFFER_MONTHS)) return;

    loading.current = true;
    const nextFrom = shiftMonth(from, -WINDOW_MONTHS);
    void loadWeighInWindow(nextFrom, shiftMonth(from, -1)).then((res) => {
      loading.current = false;
      if (res.error) return; // Silent: there is just less history on screen.
      setEntries((prev) => [...prev, ...res.entries]);
      setFrom(nextFrom);
    });
  }, [month, from]);

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

        <Headline head={head} rate={rate} goal={goal} />

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
                      <span className="text-sm">{trim(e.weightLb)} lb</span>{" "}
                      {/* The delta is why the list is worth reading rather than
                          the chart: the chart shows the shape, these are the
                          numbers that made it. Muted, never coloured -- a gain
                          is not a failure and red would say it was (S78). */}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {deltaLabel(e.weightLb, previousOf.get(e.date) ?? null) ?? "—"}
                      </span>
                    </button>
                  </ItemActions>
                </Item>
              </li>
            ))}
          </ul>
        )}
      </main>

      <WeighInSheet
        date={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        existing={editing ? (byDate.get(editing) ?? null) : null}
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
}: {
  head: ReturnType<typeof headlineOf>;
  rate: ReturnType<typeof weeklyRate>;
  goal: WeightGoal;
}) {
  if (!head) return null;

  // Under the floor there is nothing to smooth, so say what is missing rather
  // than dressing a two-point average up as a trend (S58).
  if (head.trendLb === null) {
    const need = MIN_TREND_ENTRIES - head.entryCount;
    return (
      <section className="border-b border-border px-5 py-4">
        <p className="text-3xl font-semibold tabular-nums">{trim(head.latest.weightLb)} lb</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {shortDate(head.latest.date)} · {need} more {need === 1 ? "weigh-in" : "weigh-ins"} and
          this becomes a trend
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-semibold tabular-nums">{trim(head.trendLb)} lb</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {trim(head.latest.weightLb)} on {shortDate(head.latest.date)}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Trend
        {rate ? (
          <>
            {" · "}
            <span className="tabular-nums">{rateLabel(rate)}</span> {windowLabel(rate.days)}
          </>
        ) : null}
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
                {rateLabel({ lbPerWeek: goal.rateLbPerWeek, days: 0 })}
              </span>
            </>
          )}
          {goal.weightLb != null && (
            <>
              {" · "}
              <span className="tabular-nums">{trim(goal.weightLb)} lb</span>
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
}: {
  date: string | null;
  existing: WeighIn | null;
  suggestion: number | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (entry: WeighIn) => void;
  onDeleted: (date: string) => void;
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
    setValue(existing ? String(existing.weightLb) : suggestion !== null ? String(suggestion) : "");
  } else if (date === null && openedFor !== null) {
    setOpenedFor(null);
  }

  function save() {
    if (date === null) return;
    const lb = Number(value);
    if (!Number.isFinite(lb) || lb <= 0) {
      toast.error("Enter a weight");
      return;
    }
    startTransition(async () => {
      const res = await saveWeighIn(date, lb, existing?.note ?? null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onSaved({ date, weightLb: Math.round(lb * 10) / 10, note: existing?.note ?? null });
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
              aria-label="Weight in pounds"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>lb</InputGroupText>
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
