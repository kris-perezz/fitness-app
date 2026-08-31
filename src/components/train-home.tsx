"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Dumbbell, Play } from "lucide-react";
import { shortDate, trim, type MuscleVolume } from "@/lib/training";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { closeStaleWorkouts, openWorkoutOn } from "@/app/training-actions";
import { Button } from "@/components/ui/button";
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
  month,
  today,
  sessions,
  volume,
  openSession,
}: {
  month: string;
  today: string;
  sessions: SessionSummary[];
  /** S32. Every muscle, in a fixed order, including the ones on zero. */
  volume: MuscleVolume[];
  openSession: { id: string; date: string } | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  // `pending` is read: paging the calendar is a server navigation, and without
  // a sign that it started, a slow month reads as a tap that missed.
  const [pending, startTransition] = useTransition();

  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const trainedDays = sessions.map((s) => toDate(s.date));

  /** Open a day's session, creating it if there is none (S52). */
  function open(date: string) {
    const existing = byDate.get(date);
    if (existing) {
      router.push(`/train/${existing.id}`);
      return;
    }
    startTransition(async () => {
      const res = await openWorkoutOn(date);
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not open that session");
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
    void closeStaleWorkouts().then(() => router.refresh());
  }, [staleOpen, router]);

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-medium">Train</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} this month
          </span>
        </header>

        {/* The primary action sits ABOVE the calendar and the list. It was under
            the list until a month with thirty sessions made the point: the one
            thing you came here to do should not be reachable only by scrolling
            past everything you have already done. Resuming beats browsing, so an
            open session takes the slot when there is one. */}
        <div className="border-b border-border px-5 py-4">
          {openSession ? (
            <Button className="h-12 w-full text-base" asChild>
              <Link href={`/train/${openSession.id}`}>
                <Play className="size-4" /> Resume session
              </Link>
            </Button>
          ) : (
            <Button className="h-12 w-full text-base" onClick={() => setAdding(true)}>
              <CalendarPlus className="size-4" /> Add session
            </Button>
          )}
        </div>

        <div
          className={`flex justify-center border-b border-border px-2 py-3 transition-opacity ${
            pending ? "opacity-60" : ""
          }`}
        >
          <Calendar
            month={toDate(`${month}-01`)}
            onMonthChange={(next) =>
              // In a transition, so React keeps the current month on screen and
              // marks it stale instead of blanking the calendar while the next
              // one is fetched.
              startTransition(() => router.push(`/train?month=${monthKey(next)}`))
            }
            // Every day you have actually lived through is tappable, whether or
            // not it has a session yet: a trained day opens its session, an
            // untrained one starts it. Only the future is dead, because a
            // workout you have not done is a plan (open decision 2). Untrained
            // days used to be disabled, which made the obvious gesture -- tap
            // today, log today -- do nothing at all.
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
              trained: "bg-primary! text-primary-foreground! rounded-md font-medium",
              // Today keeps a ring rather than a background, so it stays
              // identifiable whether or not it is also filled -- the two facts
              // are independent and must not compete for one channel.
              today: "rounded-md ring-2 ring-ring ring-inset",
            }}
            onSelect={(day) => day && open(dateKey(day))}
            mode="single"
            className="p-0"
          />
        </div>

        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MonthVolume volume={volume} month={month} />
        </div>

        {sessions.length === 0 && (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Dumbbell />
              </EmptyMedia>
              <EmptyTitle>Nothing logged this month</EmptyTitle>
              <EmptyDescription>
                Filled days are days you trained. Tap any day up to today, or use
                Add session above.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {sessions.length > 0 && (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id}>
                <Item asChild size="sm" className="rounded-none px-5 py-3 active:bg-accent">
                  <Link href={`/train/${s.id}`}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="font-normal">{shortDate(s.date)}</ItemTitle>
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
                  </Link>
                </Item>
              </li>
            ))}
          </ul>
        )}

      </main>

      <PickDay open={adding} onOpenChange={setAdding} today={today} />
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Date | undefined>(() => toDate(today));
  const [pending, startTransition] = useTransition();

  function go() {
    if (!picked) return;
    startTransition(async () => {
      const res = await openWorkoutOn(dateKey(picked));
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not open that session");
        return;
      }
      onOpenChange(false);
      router.push(`/train/${res.id}`);
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

        <div className="flex justify-center px-2 pb-2">
          <Calendar
            mode="single"
            selected={picked}
            onSelect={setPicked}
            // Not merely rejected on submit -- a day you have not lived through
            // is not offered in the first place.
            disabled={{ after: toDate(today) }}
            defaultMonth={toDate(today)}
            className="p-0"
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
 * the food side's `wakingDate()`. They are converted at midday so that a
 * timezone offset can never shunt a day either way.
 */
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
function MonthVolume({ volume, month }: { volume: MuscleVolume[]; month: string }) {
  const total = volume.reduce((t, v) => t + v.sets, 0);

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Sets per muscle</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {trim(total)} total
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing logged in {monthLabel(month)}. A set counts once for each muscle it trains
          directly, and half for each one it helps.
        </p>
      ) : (
        <ChartContainer config={volumeConfig} className="mt-3 h-[340px] w-full">
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
                twice, and the axis is the half that makes you measure. */}
            <XAxis type="number" dataKey="sets" hide />
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
              tick={{ fontSize: 11 }}
            />
            {/* Kept for pointer devices, but it is no longer where the numbers
                live. A tooltip is a hover affordance and this app is used on a
                phone mid-session, one-handed -- putting the only copy of the
                figures behind hover made them unreachable exactly where they
                are needed. */}
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey="sets"
              fill="var(--color-sets)"
              // The DATA END only. Rounding all four corners detaches a bar
              // from the baseline it is measured from and makes short ones look
              // longer than they are; the earlier version's comment said this
              // and its code did not.
              radius={[0, 5, 5, 0]}
              barSize={11}
            >
              <LabelList
                dataKey="sets"
                position="right"
                offset={6}
                fontSize={11}
                className="fill-muted-foreground tabular-nums"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}

/** "August 2026", for prose rather than for an axis. */
function monthLabel(month: string): string {
  return toDate(`${month}-01`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
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
