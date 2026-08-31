"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Dumbbell, Play } from "lucide-react";
import { shortDate } from "@/lib/training";
import { createWorkoutOn, currentWorkout } from "@/app/training-actions";
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
  const [pending, startTransition] = useTransition();

  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const trainedDays = sessions.map((s) => toDate(s.date));

  function start() {
    startTransition(async () => {
      const res = await currentWorkout();
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not start a session");
        return;
      }
      router.push(`/train/${res.id}`);
    });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-medium">Train</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} this month
          </span>
        </header>

        {/* Resuming beats browsing, so an open session sits above everything. */}
        {openSession && (
          <div className="border-b border-border px-5 py-4">
            <Button className="h-12 w-full text-base" asChild>
              <Link href={`/train/${openSession.id}`}>
                <Play className="size-4" /> Resume session
              </Link>
            </Button>
          </div>
        )}

        <div className="flex justify-center border-b border-border px-2 py-3">
          <Calendar
            month={toDate(`${month}-01`)}
            onMonthChange={(next) => router.push(`/train?month=${monthKey(next)}`)}
            // Days without a session are not selectable: there is nothing to
            // open, and a tap that silently does nothing is worse than a
            // control that says it cannot be pressed.
            disabled={(day) => !byDate.has(dateKey(day))}
            modifiers={{ trained: trainedDays }}
            modifiersClassNames={{
              trained: "font-semibold underline decoration-primary decoration-2 underline-offset-4",
            }}
            onSelect={(day) => {
              if (!day) return;
              const found = byDate.get(dateKey(day));
              if (found) router.push(`/train/${found.id}`);
            }}
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
                Start today&rsquo;s session, or add one for a day you trained without your
                phone.
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

        <div className="space-y-2 px-5 py-4">
          {!openSession && (
            <Button className="h-12 w-full text-base" disabled={pending} onClick={start}>
              {pending ? "Starting" : "Start today's session"}
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-full text-base"
            onClick={() => setAdding(true)}
          >
            <CalendarPlus className="size-4" /> Add a past session
          </Button>
        </div>
      </main>

      <AddPastSession open={adding} onOpenChange={setAdding} today={today} />
    </>
  );
}

/** S51. Any day up to today; tomorrow is a plan, and plans are out of scope. */
function AddPastSession({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Date | undefined>();
  const [pending, startTransition] = useTransition();

  function create() {
    if (!picked) return;
    startTransition(async () => {
      const res = await createWorkoutOn(dateKey(picked));
      if (res.error || !res.id) {
        toast.error(res.error ?? "Could not add that session");
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
          <DrawerTitle className="text-base">Add a past session</DrawerTitle>
          <DrawerDescription className="sr-only">
            Pick the day you trained.
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
            onClick={create}
            disabled={pending || !picked}
          >
            {pending ? "Adding" : picked ? `Add ${shortDate(dateKey(picked))}` : "Pick a day"}
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
