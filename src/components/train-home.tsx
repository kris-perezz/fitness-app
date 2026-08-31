"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Dumbbell, Play } from "lucide-react";
import { shortDate } from "@/lib/training";
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
  openSession,
}: {
  month: string;
  today: string;
  sessions: SessionSummary[];
  openSession: { id: string; date: string } | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

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

        <div className="flex justify-center border-b border-border px-2 py-3">
          <Calendar
            month={toDate(`${month}-01`)}
            onMonthChange={(next) => router.push(`/train?month=${monthKey(next)}`)}
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
function toDate(key: string): Date {
  return new Date(`${key.length === 7 ? `${key}-01` : key}T12:00:00`);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
