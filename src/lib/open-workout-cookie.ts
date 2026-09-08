import { cookies } from "next/headers";
import { OPEN_WORKOUT_COOKIE } from "@/lib/open-workout-cookie.shared";

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
 * `bottom-nav.tsx` reads this cookie ITSELF, straight from `document.cookie`,
 * rather than trusting the `openWorkoutId` prop the root layout hands it on
 * first render. The nav is part of the layout shell, which does not remount
 * on a client-side tab switch, so a prop set once at the layout's last server
 * render goes stale the moment a session opens or closes without a full page
 * load in between -- the exact case this cookie exists for. The prop is still
 * threaded through for the very first paint, before any client code has run.
 *
 * Best-effort only: a stale or missing cookie just falls back to the slower
 * `/train` path, it never blocks anything.
 */
export { OPEN_WORKOUT_COOKIE };

export async function setOpenWorkoutCookie(id: string) {
  const store = await cookies();
  // A real maxAge, not a session cookie. Without one this is dropped the
  // moment the browser/PWA process is killed -- which on a phone is most of
  // the time between sets, not just at midnight -- so a session opened at the
  // gym had no cookie left by the time the app was reopened to resume it, and
  // every "did the nav fix work" check landed back on the slow path.
  store.set(OPEN_WORKOUT_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });
}

export async function clearOpenWorkoutCookie(id: string) {
  const store = await cookies();
  // Only clear when it still names THIS workout -- a stray clear from a
  // finish/discard racing an open on another tab must not erase the cookie
  // for the session that is actually open now.
  if (store.get(OPEN_WORKOUT_COOKIE)?.value === id) store.delete(OPEN_WORKOUT_COOKIE);
}
