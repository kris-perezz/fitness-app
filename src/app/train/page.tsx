import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wakingDate } from "@/lib/food";
import { WINDOW_MONTHS, shiftMonth } from "@/lib/training";
import { TrainHome, type DayVolume, type SessionSummary } from "@/components/train-home";

export const dynamic = "force-dynamic";

/**
 * S50. The train tab's resting state: history, not an empty screen.
 *
 * A WINDOW, FETCHED ONCE, EXTENDED BEFORE YOU REACH ITS EDGE. The month used to
 * be a query parameter, so every tap of a calendar arrow was a server round
 * trip -- three queries and a re-render before the numbers changed. That is
 * never seamless however well it is optimised, because a round trip is a round
 * trip: prefetching the neighbours hides it for two months, caching hides it
 * the second time you visit one.
 *
 * So the month became client state and the data comes up front. Not ALL of it,
 * though: that was the first attempt and it grows without limit -- fine at 175
 * sessions, a liability at ten years. Six months is roughly what anyone pages
 * through in one sitting, and train-home.tsx fetches the next six while you are
 * still two months from needing them.
 *
 * What makes a window affordable at all is that 0018 and the muscle_volume view
 * made the rows small: a session is one summary row rather than every set it
 * contains, and volume is one row per day per muscle.
 *
 * The month is no longer in the URL, so it is not shareable and the back button
 * does not step through months. Both were checked; neither is wanted here.
 */
export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ browse?: string }>;
}) {
  const today = wakingDate();
  const supabase = await createClient();

  // The window ends today and reaches back WINDOW_MONTHS, today's month
  // included -- so six months means five back plus this one.
  const from = `${shiftMonth(today.slice(0, 7), -(WINDOW_MONTHS - 1))}-01`;

  const [{ data: openRows }, { data: sessionRows }, { data: volumeRows }] = await Promise.all([
    supabase.from("workouts").select("id, log_date").is("ended_at", null).limit(1),
    supabase
      .from("workout_summaries")
      .select("id, log_date, exercises, set_count, volume_lb")
      .gte("log_date", from)
      .order("log_date", { ascending: false }),
    supabase.from("muscle_volume").select("log_date, muscle, sets").gte("log_date", from),
  ]);

  const open = openRows?.[0] ?? null;

  /**
   * S26. An open session IS the train tab. "I want an unfinished session
   * waiting exactly where I left it" means arriving here mid-workout should put
   * you back in it, not offer a button that asks whether you meant it. Only an
   * OPEN session does this -- a finished one is history and has no claim on you.
   *
   * `?browse=1` is the way out, and the back chevron inside a session sets it.
   * Without an escape this is a trap: back would land on /train, /train would
   * send you straight in, and the calendar and the volume chart would be
   * unreachable for as long as a session stayed open -- which is exactly when
   * you might want to check whether the month is short on back work.
   *
   * Stateless on purpose. The alternative is remembering "they just backed out,
   * do not send them in again", and that is a flag with a lifetime, which is a
   * flag that eventually gets it wrong.
   */
  const { browse } = await searchParams;
  // TODAY'S open session only. A session left open overnight is not something
  // to resume, it is something to close (S26, and closeStaleWorkouts on the
  // screen below does it) -- redirecting into it would strand you in yesterday
  // and put the sweep that ends it on a page you could no longer reach.
  if (open && open.log_date === today && !browse) redirect(`/train/${open.id}`);

  const sessions: SessionSummary[] = (sessionRows ?? []).map((row) => ({
    id: row.id as string,
    date: row.log_date as string,
    exercises: (row.exercises ?? []) as string[],
    setCount: Number(row.set_count),
    volumeLb: Number(row.volume_lb),
  }));

  // Left at day grain and grouped in the browser, because the browser is what
  // now decides which month is on screen. Numeric arrives from PostgREST as a
  // string, so Number() at the boundary rather than at every use.
  const volume: DayVolume[] = (volumeRows ?? []).map((row) => ({
    date: row.log_date as string,
    muscle: row.muscle as string,
    sets: Number(row.sets),
  }));

  return (
    <TrainHome
      today={today}
      loadedFrom={from.slice(0, 7)}
      sessions={sessions}
      volume={volume}
      openSession={open ? { id: open.id as string, date: open.log_date as string } : null}
    />
  );
}
