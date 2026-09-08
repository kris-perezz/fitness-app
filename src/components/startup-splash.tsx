import { PATHS } from "@/lib/dumbbell-icon";

/**
 * The mark, full-screen, on the app's own background -- for the gap between
 * "the browser opened this" and "there is a page here."
 *
 * That gap is real and mostly not this app's to close: every route is
 * `force-dynamic`, so a cold Vercel function has to boot before the first byte
 * of HTML ships, and no amount of client code can paint before that byte
 * arrives. What WAS in this app's control is what the browser showed while it
 * waited -- nothing, which painted as a blank rectangle in whatever the
 * system's colour scheme happens to be (black, in dark mode). This is that
 * rectangle with the app's own mark on it instead.
 *
 * Pure CSS, no script: it is part of the static shell, so it is in the FIRST
 * byte this app can control and needs nothing to hydrate before it shows. It
 * fades on a timer rather than on a "content ready" signal because there is no
 * cheap way to know that from a layout that wraps every route -- the timer is
 * tuned to a warm request (a couple hundred ms) so it clears just behind the
 * real content arriving, and simply gets out of the way sooner on a cold one.
 */
export function StartupSplash() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background [animation:app-splash-out_220ms_ease-in_520ms_forwards]"
    >
      <svg
        width={56}
        height={56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-foreground/90 [animation:app-splash-pulse_1200ms_ease-in-out_infinite]"
      >
        {PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}
