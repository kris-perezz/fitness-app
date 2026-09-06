"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { WINDOW_BUFFER_MONTHS, WINDOW_MONTHS, shiftMonth } from "@/lib/training";
import { loadIntakeDaysWindow, type DayLog } from "@/app/actions";
import type { DayGoal } from "@/lib/goals";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { DayRingsButton, RING_LEGEND, type DayRingInfo } from "@/components/day-rings";
import { cn } from "@/lib/utils";
import { PAGE, SURFACE } from "@/lib/ui";

/**
 * S103. Exactly S57's shape, moved to Food: a filled day is a day with
 * anything logged against it, nothing more -- no fraction, no arc, no score.
 * The calendar wiring (`modifiers`, `fixedWeeks`, month held in client state)
 * is copied from train-home.tsx/progress-home.tsx rather than reinvented, per
 * the standing rule that a third copy of a pattern is what earns a shared
 * shell, not the second.
 *
 * S89, strict mode only: the plain fill above is replaced by `DayRingsButton`
 * via the Calendar's own `components.DayButton` override. Calm never builds
 * the ring lookup at all -- the tone owns no data, so there is nothing for it
 * to have an opinion about here either.
 */
export function MonthLog({
  today,
  loadedFrom,
  days: initialDays,
  dayGoals: initialDayGoals,
  strictMode,
}: {
  today: string;
  /** Oldest month the server sent, as YYYY-MM-01. */
  loadedFrom: string;
  days: DayLog[];
  /** Empty in calm mode -- the page never asks `day_goals` for a mode with no
   * rings to read it. */
  dayGoals: DayGoal[];
  strictMode: boolean;
}) {
  const router = useRouter();

  // The month is state, not a URL parameter and not a server round trip --
  // the same contract train-home.tsx and progress-home.tsx already use, for
  // the same reason: a round trip per calendar arrow is never seamless.
  const [month, setMonth] = useState(today.slice(0, 7));

  // The window, and everything in it. Grown backwards in place rather than
  // refetched, so a month already held is never asked for twice.
  const [days, setDays] = useState(initialDays);
  const [dayGoals, setDayGoals] = useState(initialDayGoals);
  const [from, setFrom] = useState(loadedFrom);
  const loading = useRef(false);

  /**
   * Extend BEFORE the edge is reached, not when it is hit -- see
   * train-home.tsx's identical effect for why.
   */
  useEffect(() => {
    if (loading.current) return;
    if (month > shiftMonth(from, WINDOW_BUFFER_MONTHS)) return;

    loading.current = true;
    const nextFrom = shiftMonth(from, -WINDOW_MONTHS);
    void loadIntakeDaysWindow(nextFrom, shiftMonth(from, -1), strictMode)
      .then((res) => {
        if (res.error) return; // Silent: nothing is broken, there is just less history on screen.
        setDays((prev) => [...prev, ...res.days]);
        setDayGoals((prev) => [...prev, ...res.dayGoals]);
        setFrom(nextFrom);
      })
      .finally(() => {
        loading.current = false;
      });
  }, [month, from, strictMode]);

  // Filled = a row exists with something in it. `item_count` is checked
  // rather than merely the row's presence, so a day whose entries were all
  // deleted reads as unlogged rather than as a stray zero -- the same guard
  // `dailySeries` in lib/trends.ts already applies to the same view.
  const loggedDays = useMemo(
    () => days.filter((d) => d.item_count > 0).map((d) => toDate(d.log_date)),
    [days],
  );

  // S89. One lookup per date, built only in strict mode -- calm has no rings
  // to feed it and no reason to pay for the join.
  const ringInfo = useMemo(() => {
    if (!strictMode) return null;
    const goalByDate = new Map(dayGoals.map((g) => [g.log_date, g]));
    const info = new Map<string, DayRingInfo>();
    for (const d of days) {
      info.set(d.log_date, {
        kcal: d.kcal,
        protein_g: d.protein_g,
        carb_g: d.carb_g,
        fat_g: d.fat_g,
        goal: goalByDate.get(d.log_date) ?? null,
      });
    }
    // A day with a goal but no intake_days row at all -- nothing logged, ever
    // -- still needs its tracks drawn, so every dated goal gets an entry even
    // when `days` has none for it.
    for (const g of dayGoals) {
      if (!info.has(g.log_date)) {
        info.set(g.log_date, { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, goal: g });
      }
    }
    return info;
  }, [strictMode, days, dayGoals]);

  return (
    <main className={PAGE}>
      <header className="flex items-center gap-1 px-1 py-1">
        <Button size="icon-xl" variant="ghost" aria-label="Back to the log" asChild>
          <Link href="/log">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <span className="text-sm font-medium">Month</span>
      </header>

      {/* S89. Fixed order, restated here rather than only in each day's own
          screen-reader label -- position, the legend and colour all carry
          the same identity, so no one of the three is ever the only way to
          tell the four rings apart. A dot's colour is identity, not a
          verdict: the same token appears here whether the month ran over or
          under, exactly as it does on every one of the month's days. */}
      {strictMode && (
        <div className="flex items-center justify-center gap-3 px-1 text-[11px] text-muted-foreground">
          {RING_LEGEND.map(({ key, label, dot }) => (
            <span key={key} className="flex items-center gap-1">
              <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
              {label}
            </span>
          ))}
        </div>
      )}

      <Card className={cn(SURFACE, "items-center py-2", "px-1")}>
        <Calendar
          month={toDate(`${month}-01`)}
          onMonthChange={(next) => setMonth(monthKey(next))}
          // Always six week rows -- see train-home.tsx's identical comment:
          // without it the grid changes height month to month.
          fixedWeeks
          // Matches the log tab's own day arrows, which stop at today for the
          // same reason: there is nothing to fetch past it.
          disabled={{ after: toDate(today) }}
          // Calm's own fill modifier. Strict mode passes none at all: the
          // rings replace it entirely, and a leftover `logged` class would
          // paint a solid fill UNDER the rings this mode draws instead.
          modifiers={strictMode ? {} : { logged: loggedDays }}
          modifiersClassNames={{
            ...(strictMode
              ? {}
              : {
                  // Same solid-fill treatment `trained`/`weighed` already use
                  // on the other two tab calendars, so one visual language
                  // means "day with something on it" everywhere in the app.
                  logged:
                    "bg-primary! text-primary-foreground! rounded-full border-2 border-transparent bg-clip-padding font-medium",
                }),
            // A fill or a mark from the month either side is a real day, so it
            // is drawn -- at less weight, so the month on screen still reads
            // as the subject.
            outside: "opacity-45",
            // A circle on a square cell, the cell's own radius on the taller
            // ring cell: a ring drawn round a 48x64 box is an oval, which
            // reads as a shape rather than as a mark on today.
            today: strictMode
              ? "rounded-(--cell-radius) ring-2 ring-ring ring-inset"
              : "rounded-full ring-2 ring-ring ring-inset",
          }}
          // Square only in calm mode. A ring mark needs the numeral to sit
          // ABOVE it rather than inside it, which needs real height a square
          // cell does not have -- so strict mode overrides the day slot on
          // THIS calendar alone, leaving the shared square default in
          // ui/calendar.tsx (and the train/progress calendars) untouched.
          classNames={
            strictMode
              ? {
                  day: "group/day relative w-(--cell-size) h-[68px] shrink-0 rounded-(--cell-radius) p-0 text-center select-none",
                }
              : undefined
          }
          components={
            strictMode
              ? {
                  DayButton: (props) => (
                    <DayRingsButton {...props} info={ringInfo?.get(dateKey(props.day.date))} />
                  ),
                }
              : undefined
          }
          // No day-creation step to await, unlike the train/progress
          // calendars: the log screen already renders any date, logged or
          // not, so tapping is a plain navigation rather than an action.
          onSelect={(day) => day && router.push(`/log?date=${dateKey(day)}`)}
          mode="single"
          className={cn(
            "bg-transparent p-0",
            // 32px square in calm, matching train-home.tsx and
            // progress-home.tsx exactly. 52px in strict mode, which is the
            // widest a column can be here: the page gutter and this card's
            // padding take 24px of a 393px phone, and 369 / 7 is 52.7.
            strictMode ? "[--cell-size:--spacing(13)]" : "[--cell-size:--spacing(8)]",
          )}
        />
      </Card>
    </main>
  );
}

/**
 * Dates cross this boundary as YYYY-MM-DD (or YYYY-MM for a month) strings,
 * converted at midday so a timezone offset can never shunt a day either way
 * -- the same convention every other calendar screen in this app follows.
 */
function toDate(key: string): Date {
  return new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00`);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
