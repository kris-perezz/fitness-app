import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { isWorkingSet, type WorkoutSet } from "@/lib/training";
import { TrainHome, type SessionSummary } from "@/components/train-home";

export const dynamic = "force-dynamic";

/**
 * S50. The train tab's resting state: a month of history, not an empty screen.
 *
 * The month is a query parameter rather than client state so that paging back
 * is a real navigation -- shareable, back-button-able, and refetched on the
 * server instead of accumulating months in the browser.
 */
export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: requested } = await searchParams;
  const today = wakingDate();
  const month = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested! : today.slice(0, 7);

  const supabase = await createClient();

  const [{ data: openRows }, { data: monthRows }] = await Promise.all([
    supabase.from("workouts").select("id, log_date").is("ended_at", null).limit(1),
    supabase
      .from("workouts")
      .select("id, log_date, exercises:workout_exercises(name, sets:workout_sets(*))")
      .gte("log_date", `${month}-01`)
      .lte("log_date", lastDayOf(month))
      .order("log_date", { ascending: false }),
  ]);

  const open = openRows?.[0] ?? null;

  const sessions: SessionSummary[] = (monthRows ?? []).map((row) => {
    const slots = (row.exercises ?? []) as { name: string; sets: WorkoutSet[] }[];
    const sets = slots.flatMap((slot) => (slot.sets ?? []).filter(isWorkingSet));

    return {
      id: row.id as string,
      date: row.log_date as string,
      exercises: slots.map((slot) => slot.name),
      setCount: sets.length,
      // Summed as logged, per S49: per-side work counts once. A figure for
      // comparing sessions to each other, not a claim about physics.
      volumeLb: Math.round(sets.reduce((t, s) => t + s.load_lb * (s.reps ?? 0), 0)),
    };
  });

  return (
    <TrainHome
      month={month}
      today={today}
      sessions={sessions}
      openSession={open ? { id: open.id as string, date: open.log_date as string } : null}
    />
  );
}

/** Last calendar day of a YYYY-MM, via day 0 of the following month. */
function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, m, 0));
  return end.toISOString().slice(0, 10);
}
