import { cookies } from "next/headers";

/**
 * The id of today's open session, mirrored into a cookie so the bottom nav
 * (a client component with no Supabase access) can link straight to
 * `/train/{id}` instead of `/train`.
 *
 * Without this, tapping Train while a session is open cost a full extra round
 * trip: `/train` loads, its server component discovers the open session, and
 * only then redirects to the real screen -- a hop `prefetch` on the nav link
 * can never cover, because the nav does not know the id in advance. Reading it
 * from a cookie set the moment a session opens closes that gap.
 *
 * Best-effort only: a stale or missing cookie just falls back to the slower
 * `/train` path, it never blocks anything.
 */
export const OPEN_WORKOUT_COOKIE = "open_workout_id";

export async function setOpenWorkoutCookie(id: string) {
  const store = await cookies();
  store.set(OPEN_WORKOUT_COOKIE, id, { path: "/", sameSite: "lax" });
}

export async function clearOpenWorkoutCookie(id: string) {
  const store = await cookies();
  // Only clear when it still names THIS workout -- a stray clear from a
  // finish/discard racing an open on another tab must not erase the cookie
  // for the session that is actually open now.
  if (store.get(OPEN_WORKOUT_COOKIE)?.value === id) store.delete(OPEN_WORKOUT_COOKIE);
}
