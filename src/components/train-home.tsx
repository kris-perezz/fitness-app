"use client";

import { isMonth, useUrlParam } from "@/lib/url-state";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Dumbbell, Play } from "lucide-react";
import {
  dayTitle,
  MUSCLE_GROUPS,
  WINDOW_BUFFER_MONTHS,
  WINDOW_MONTHS,
  shiftMonth,
  shortDate,
  type MuscleVolume,
} from "@/lib/training";
import dynamic from "next/dynamic";
import { countDomain } from "@/lib/chart";
import { closeStaleWorkouts, loadTrainingWindow, openWorkoutOn } from "@/app/training-actions";
import { reach } from "@/lib/reach";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShowMore, usePaged } from "@/components/show-more";
import { Calendar } from "@/components/ui/calendar";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PAGE_SPLIT, SURFACE, SURFACE_PAD } from "@/lib/ui";
import { useSwipe } from "@/lib/swipe";
import { leaveSheet } from "@/lib/sheet-back";

// Loaded after the page: recharts is most of the tab's script, and nothing
// above the chart needs it to become tappable.
const VolumeBars = dynamic(() => import("@/components/volume-bars").then((m) => m.VolumeBars), {
  ssr: false,
  loading: () => <div className="mt-2 h-[300px] w-full" />,
});

/** S32. One day's credit to one muscle, straight off the muscle_volume view. */
export type DayVolume = { date: string; muscle: string; sets: number };

export type SessionSummary = {
  id: string;
  date: string;
  exercises: string[];
  setCount: number;
  volumeLb: number;
};

/**
 * S50. What the train tab shows when you are not mid-session.
 *
 * A calendar answers "have I been consistent" in one glance and can say nothing
 * about what was actually done; a list says what was done and makes gaps
 * invisible. Both, then -- the calendar for the shape of the month, the list
 * under it for its contents.
 */
export function TrainHome({
  today,
  loadedFrom,
  sessions: initialSessions,
  volume: initialVolume,
  openSession,
}: {
  today: string;
  /** Oldest month the server sent, as YYYY-MM. */
  loadedFrom: string;
  sessions: SessionSummary[];
  /** Day grain; the month on screen is summed from it here. */
  volume: DayVolume[];
  openSession: { id: string; date: string } | null;
}) {
  const router = useRouter();
  // The day the "Which day?" sheet opens on, or null when it is closed.
  const [adding, setAdding] = useState<string | null>(null);

  // The month is state, not a URL parameter and not a server round trip. Every
  // session and every day of volume is already here, so paging is a filter
  // rather than a fetch -- which is the only way it is ever instant.
  const [month, setMonth] = useUrlParam("month", today.slice(0, 7), isMonth(today));

  // The window, and everything in it. Grown backwards in place rather than
  // refetched, so a month already held is never asked for twice.
  const [sessions, setSessions] = useState(initialSessions);
  const [volume, setVolume] = useState(initialVolume);
  const [from, setFrom] = useState(loadedFrom);
  const loading = useRef(false);

  /**
   * Extend BEFORE the edge is reached, not when it is hit.
   *
   * The fetch happens while you are still looking at a month you already have,
   * so by the time you page into the older ones they are simply there. Waiting
   * for the edge would put the network call exactly where it is visible, which
   * is the thing this whole approach exists to avoid.
   */
  useEffect(() => {
    if (loading.current) return;
    if (month > shiftMonth(from, WINDOW_BUFFER_MONTHS)) return;

    loading.current = true;
    const nextFrom = shiftMonth(from, -WINDOW_MONTHS);
    void reach(loadTrainingWindow(nextFrom, shiftMonth(from, -1)))
      .then((res) => {
        if (res.error) return; // Silent: nothing is broken, there is just less history on screen.
        setSessions((prev) => [...prev, ...res.sessions]);
        setVolume((prev) => [...prev, ...res.volume]);
        setFrom(nextFrom);
      })
      // In `finally` so a rejected call releases the guard too. Clearing it
      // only on success latches it for the session and every later extension
      // is skipped.
      .finally(() => {
        loading.current = false;
      });
  }, [month, from]);

  const monthSessions = useMemo(
    () => sessions.filter((s) => s.date.startsWith(month)),
    [sessions, month],
  );
  const sessionPage = usePaged(monthSessions, month);

  // Summed for the month on screen, then laid out in the fixed group order so
  // untrained muscles still occupy a row (S32 -- the zeros are the point).
  const monthVolume: MuscleVolume[] = useMemo(() => {
    const byMuscle = new Map<string, number>();
    for (const row of volume) {
      if (!row.date.startsWith(month)) continue;
      byMuscle.set(row.muscle, (byMuscle.get(row.muscle) ?? 0) + row.sets);
    }
    return MUSCLE_GROUPS.map((muscle) => ({ muscle, sets: byMuscle.get(muscle) ?? 0 }));
  }, [volume, month]);

  /**
   * ONE SCALE FOR EVERY MONTH, and this is a bug fix rather than a refinement.
   *
   * Left to itself recharts fits the axis to the data it is given, which is one
   * month -- so a month of 3 sets drew exactly the same bar as a month of 300,
   * and the only difference was the number printed at the end of it. The
   * animation made it worse: the bars slide from month to month, which states a
   * comparison the chart was not making.
   *
   * The denominator is the largest single-muscle month in the LOADED window,
   * rounded up to a ten. Not a target -- there are no volume targets in this
   * app and inventing one would assert a number nobody set (S32). It is only a
   * shared ruler, taken from the data itself, so "did I do less chest in July"
   * is answered by the bars rather than by reading two labels and subtracting.
   *
   * It moves when a wider window loads and a bigger month arrives. That is the
   * honest behaviour: the ruler grew because the log got longer, and every bar
   * rescales together so their relationship to each other is preserved.
   */
  const volumeScale = useMemo(() => {
    const byMonthMuscle = new Map<string, number>();
    for (const row of volume) {
      const key = `${row.date.slice(0, 7)}|${row.muscle}`;
      byMonthMuscle.set(key, (byMonthMuscle.get(key) ?? 0) + row.sets);
    }
    // Zero-based and rounded up to a ten, per the chart contract: sets are a
    // COUNT, so zero is a real value here in a way it is not on a bodyweight
    // axis, and the rounding is what keeps the ruler still when one extra set
    // lands in the biggest month.
    return countDomain([...byMonthMuscle.values()])[1];
  }, [volume]);

  const byDate = useMemo(() => new Map(sessions.map((s) => [s.date, s])), [sessions]);
  const trainedDays = useMemo(() => sessions.map((s) => toDate(s.date)), [sessions]);

  /**
   * Open a day's session (S52). A day with none asks first, on the same sheet
   * as Add session: a tap to look at a day must not mark it as trained.
   */
  function open(date: string) {
    const existing = byDate.get(date);
    if (existing) router.push(`/train/${existing.id}`);
    else setAdding(date);
  }

  const [starting, startStarting] = useTransition();
  function startToday() {
    if (starting) return;
    startStarting(async () => {
      const res = await reach(openWorkoutOn(today));
      if (res.error || !res.id) {
        toast.error(res.error ?? "Couldn't start the session");
        return;
      }
      router.push(`/train/${res.id}`);
    });
  }

  // S53. Forgetting to press Finish is the normal case -- the last thing you do
  // in a gym is leave -- so a session left open on an earlier day is closed on
  // sight rather than waiting for the next deliberate action. Guarded by a ref
  // because React runs effects twice in development and this one writes.
  const swept = useRef(false);
  const staleOpen = openSession !== null && openSession.date !== today;
  useEffect(() => {
    if (!staleOpen || swept.current) return;
    swept.current = true;
    void reach(closeStaleWorkouts()).then(() => router.refresh());
  }, [staleOpen, router]);

  // What the calendar's own two nav arrows do, from anywhere on the grid. The
  // month drives the chart and the list under it too, so this pages the whole
  // screen rather than just the dates.
  const monthSwipe = useSwipe({
    onLeft: () => setMonth(shiftMonth(month, 1)),
    onRight: () => setMonth(shiftMonth(month, -1)),
  });

  return (
    <>
      <main className={PAGE_SPLIT}>
        {/* The primary action sits ABOVE the calendar and the list: the one
            thing you came here to do should not be reachable only by scrolling
            past everything you have already done. Resuming beats browsing, so an
            open session takes the slot when there is one. Spans both desktop
            columns -- it belongs to the screen, not to either side of it. */}
        <header className="pt-1 lg:col-span-2">
          {openSession ? (
            <Button className="h-12 w-full text-base" asChild>
              {/* Full prefetch, not the default. A dynamic route prefetched
                  the ordinary way only fetches as far as its loading boundary,
                  so the skeleton arrives instantly and the DATA still lands on
                  tap -- the same wait, better dressed. prefetch={true} pulls the
                  whole thing and holds it under the static stale time. */}
              <Link href={`/train/${openSession.id}`} prefetch>
                <Play className="size-4" /> Resume session
              </Link>
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button className="h-12 flex-1 text-base" disabled={starting} onClick={startToday}>
                <Play className="size-4" />
                {starting ? "Opening" : byDate.has(today) ? "Open today's session" : "Start today's workout"}
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => setAdding(dateKey(new Date(toDate(today).getTime() - 864e5)))}
              >
                <CalendarPlus className="size-4" /> Past day
              </Button>
            </div>
          )}
        </header>

        {/* THE VOLUME COLUMN. Wide on desktop (PAGE_SPLIT's `1fr`): the bar
            chart is the one block on this screen that actually uses extra
            width, the same role the trend chart plays on the progress tab. */}
        <div className="space-y-2">
        <MonthVolume volume={monthVolume} month={month} today={today} scale={volumeScale} />
        </div>

        {/* THE CALENDAR COLUMN. Fixed-width on desktop (PAGE_SPLIT's 22rem),
            same call as the progress tab's calendar: a month grid does not
            get more useful by getting wider, and the session list belongs
            beside it rather than under the chart, so both fit one screen's
            height without a scroll on most months. */}
        <div className="space-y-2">
        <Card className={cn(SURFACE, "items-center px-1 py-2", "touch-pan-y")} {...monthSwipe}>
          <Calendar
            month={toDate(`${month}-01`)}
            // Straight to state. There is nothing to fetch, so there is
            // nothing to wait for and nothing to show a pending state about.
            onMonthChange={(next) => setMonth(monthKey(next))}
            // Every day you have actually lived through is tappable, whether or
            // not it has a session yet: a trained day opens its session, an
            // untrained one starts it. Only the future is dead, because a
            // workout you have not done is a plan (open decision 2). Untrained
            // days used to be disabled, which made the obvious gesture -- tap
            // today, log today -- do nothing at all.
            // Always six week rows, even in a month that only needs five.
            // Without it the calendar is a different height month to month, so
            // everything under it -- the chart especially -- jumps as you page.
            // A grid that changes size is the opposite of the seamless switch
            // this screen is built around, and the cost is one row of greyed
            // next-month days in the months that do not need it.
            fixedWeeks
            disabled={{ after: toDate(today) }}
            modifiers={{ trained: trainedDays }}
            modifiersClassNames={{
              // A solid fill, not an underline. The point of a training
              // calendar is to make a month of work feel like something, and a
              // thin line under a numeral has the visual weight of a footnote:
              // streaks do not read, gaps do not read, and you end up hunting
              // for the marks instead of seeing the shape of the month.
              //
              // Marked important because the calendar paints `today` with
              // bg-muted on this same element, and a trained today must read as
              // trained. Class order alone would not settle that reliably.
              // The transparent border plus bg-clip-padding is what keeps two
              // consecutive days from touching. Square fills sat edge to edge and
              // six sessions in a row fused into one bar that read as a selected
              // RANGE rather than as six separate days.
              trained:
                "bg-primary! text-primary-foreground! rounded-full border-2 border-transparent bg-clip-padding font-medium",
              // Today keeps a ring rather than a background, so it stays
              // identifiable whether or not it is also filled -- the two facts
              // are independent and must not compete for one channel.
              // A fill from the month either side is real food or a real
              // session, so it is drawn -- at less weight, so the month on
              // screen still reads as the subject.
              outside: "opacity-60",
              today: "rounded-full ring-2 ring-ring ring-inset",
            }}
            onSelect={(day) => day && open(dateKey(day))}
            mode="single"
            className="bg-transparent p-0 [--cell-size:--spacing(11)]"
          />
        </Card>

        {monthSessions.length === 0 && (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Dumbbell />
              </EmptyMedia>
              <EmptyTitle>Nothing logged this month</EmptyTitle>
              <EmptyDescription>
                Filled days are training days. Tap a day to log it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {monthSessions.length > 0 && (
          <ul className="divide-y divide-border">
            {sessionPage.visible.map((s) => (
              <li key={s.id}>
                <Item asChild size="sm" className="rounded-none px-3.5 py-3 active:bg-accent">
                  <IntentLink href={`/train/${s.id}`}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{dayTitle(s.date, today)}</ItemTitle>
                      <ItemDescription className="truncate text-xs">
                        {s.exercises.length === 0
                          ? "No exercises yet"
                          : s.exercises.join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      <span>
                        {s.setCount} {s.setCount === 1 ? "set" : "sets"}
                      </span>
                    </ItemActions>
                  </IntentLink>
                </Item>
              </li>
            ))}
          </ul>
        )}
        <ShowMore paged={sessionPage} />
        </div>
      </main>

      <PickDay
        key={adding ?? "closed"}
        open={adding !== null}
        onOpenChange={(isOpen) => !isOpen && setAdding(null)}
        today={today}
        day={adding ?? today}
      />
    </>
  );
}

/**
 * S51/S52. Pick the day. Defaults to today, because that is what it usually is;
 * anything earlier is one tap away and needs no separate control.
 *
 * The action is "open that day's session", so picking a day that already has
 * one goes to it rather than refusing or duplicating -- which is the behaviour
 * that made a second button unnecessary.
 */
function PickDay({
  open,
  onOpenChange,
  today,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Selected when the sheet opens. */
  day: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Date | undefined>(() => toDate(day));
  const [pending, startTransition] = useTransition();
  // Held here only so the grid can be swiped. Uncontrolled, the month is
  // day-picker's own private state and a gesture has nothing to move.
  const [month, setMonth] = useState(() => toDate(day));
  const monthSwipe = useSwipe({
    onLeft: () => setMonth(shiftMonthDate(month, 1)),
    onRight: () => setMonth(shiftMonthDate(month, -1)),
  });

  function go() {
    if (!picked || pending) return;
    startTransition(async () => {
      const res = await reach(openWorkoutOn(dateKey(picked)));
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not open that session");
        return;
      }
      leaveSheet(router, `/train/${res.id}`);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="px-5 pb-2 pt-0">
          <DrawerTitle className="text-base">Which day?</DrawerTitle>
          <DrawerDescription className="sr-only">
            Pick the day you trained. Today is selected already.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex justify-center px-2 pb-2 touch-pan-y" {...monthSwipe}>
          <Calendar
            mode="single"
            selected={picked}
            onSelect={setPicked}
            month={month}
            onMonthChange={setMonth}
            // Not merely rejected on submit -- a day you have not lived through
            // is not offered in the first place.
            disabled={{ after: toDate(today) }}
            // Six rows whatever the month needs, so paging does not resize the
            // sheet under the thumb that is paging it.
            fixedWeeks
            // The same round day mark the tab calendars carry, so a day means
            // the same shape wherever it is drawn. The day slot is restated
            // rather than added to: the registry's own rules round the first
            // and last cell of a selected RANGE, and in single mode they only
            // ever cut a Sunday or a Saturday in half.
            classNames={{
              day: "group/day relative size-(--cell-size) shrink-0 rounded-full p-0 text-center select-none [&_button]:rounded-full",
            }}
            modifiersClassNames={{
              today: "rounded-full ring-2 ring-ring ring-inset",
            }}
            className="bg-transparent p-0 [--cell-size:--spacing(11)]"
          />
        </div>

        <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
          <Button
            className="h-11 w-full text-base"
            onClick={go}
            disabled={pending || !picked}
          >
            {pending
              ? "Opening"
              : !picked
                ? "Pick a day"
                : dateKey(picked) === today
                  ? "Train today"
                  : `Log ${shortDate(dateKey(picked))}`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Dates cross this boundary as YYYY-MM-DD strings, the same as `log_date` and
 * the food side's `todayDate()`. They are converted at midday so that a
 * timezone offset can never shunt a day either way.
 */

/**
 * S32. Working sets per muscle group, for the month the calendar is showing.
 *
 * EVERY muscle is plotted, including the ones on zero, and the zeros are the
 * point: the story asks whether a muscle is actually being trained, and a chart
 * of only what you did train cannot answer that. An untrained muscle has to
 * read as an absence -- a labelled row with no bar -- rather than be inferred
 * from a name that is missing.
 *
 * Fixed order, never sorted by size. A ranked chart reshuffles every time you
 * train, so nothing is ever where you left it; in a fixed order you learn that
 * Calves is last and can check it at a glance. This is a thing you look at
 * repeatedly, not a one-off ranking.
 *
 * One series, therefore ONE colour on every bar and no legend -- the heading
 * names the measure. Colouring bars darker-where-bigger would spend the only
 * free channel restating the length the bar already shows.
 *
 * No target line: there are no volume targets in this app, and inventing a
 * denominator to make the chart look finished would assert a number nobody set.
 * The comparison that matters is muscles against each other, which the bars
 * already make.
 */
function MonthVolume({
  volume,
  month,
  today,
  scale,
}: {
  volume: MuscleVolume[];
  month: string;
  today: string;
  /** The shared denominator across every loaded month. See `volumeScale`. */
  scale: number;
}) {
  const total = volume.reduce((t, v) => t + v.sets, 0);

  return (
    <Card className={cn(SURFACE, SURFACE_PAD)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Sets per muscle · {monthTitle(month, today)}
      </h2>

      {total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing logged in {monthLabel(month)}. A set counts once for each muscle it trains
          directly, and half for each one it helps.
        </p>
      ) : (
        <>
          <VolumeBars volume={volume} scale={scale} />
          <p className="text-xs text-muted-foreground">Assisting muscles count half a set.</p>
        </>
      )}
    </Card>
  );
}

/** "October", or "October 2025" outside the current year. */
function monthTitle(month: string, today: string): string {
  return toDate(month).toLocaleDateString(
    "en-US",
    month.startsWith(today.slice(0, 4)) ? { month: "long" } : { month: "long", year: "numeric" },
  );
}

/** "August 2026", for prose rather than for an axis. */
function monthLabel(month: string): string {
  return toDate(`${month}-01`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}


/**
 * Full prefetch only once a row is pointed at. A month of rows all sit in view
 * on desktop, and full-prefetching each one is a server render per session.
 */
function IntentLink({ onPointerEnter, onFocus, ...props }: React.ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : null}
      onPointerEnter={(e) => {
        setIntent(true);
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
    />
  );
}

function toDate(key: string): Date {
  return new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00`);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** `shiftMonth` for the one calendar that holds its month as a Date. */
function shiftMonthDate(d: Date, months: number): Date {
  return toDate(shiftMonth(monthKey(d), months));
}
