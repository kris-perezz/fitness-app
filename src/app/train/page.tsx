import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { MUSCLE_GROUPS, type MuscleVolume } from "@/lib/training";
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

  const [{ data: openRows }, { data: monthRows }, { data: volumeRows }] = await Promise.all([
    supabase.from("workouts").select("id, log_date").is("ended_at", null).limit(1),
    // 0018. Names, set count and volume already totalled, instead of every set
    // of every session in the month fetched so this file could count them.
    supabase
      .from("workout_summaries")
      .select("id, log_date, exercises, set_count, volume_lb")
      .gte("log_date", `${month}-01`)
      .lte("log_date", lastDayOf(month))
      .order("log_date", { ascending: false }),
    // S32, over the SAME month the calendar is showing. Day grain from the
    // view, summed here -- the view deliberately picks no window at all, so
    // this and S82's eight-week chart can ask the same rows different
    // questions. Paging the calendar back re-runs this with it, which is the
    // point: the totals belong to the month you are looking at.
    supabase
      .from("muscle_volume")
      .select("muscle, sets")
      .gte("log_date", `${month}-01`)
      .lte("log_date", lastDayOf(month)),
  ]);

  const open = openRows?.[0] ?? null;

  const sessions: SessionSummary[] = (monthRows ?? []).map((row) => ({
    id: row.id as string,
    date: row.log_date as string,
    exercises: (row.exercises ?? []) as string[],
    setCount: Number(row.set_count),
    volumeLb: Number(row.volume_lb),
  }));

  // Several days of the same muscle add up into one weekly figure. Numeric
  // arrives from PostgREST as a string, so Number() at the boundary.
  const byMuscle = new Map<string, number>();
  for (const row of (volumeRows ?? []) as { muscle: string; sets: string }[]) {
    byMuscle.set(row.muscle, (byMuscle.get(row.muscle) ?? 0) + Number(row.sets));
  }
  const volume: MuscleVolume[] = MUSCLE_GROUPS.map((muscle) => ({
    muscle,
    sets: byMuscle.get(muscle) ?? 0,
  }));

  return (
    <TrainHome
      month={month}
      today={today}
      sessions={sessions}
      volume={volume}
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
