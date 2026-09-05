/**
 * The strawberry half of the strawberry matcha theme.
 *
 * Four pink shapes drifting behind the whole app. They are kept SMALLER THAN
 * THE SCREEN and given a solid core before the falloff, because four soft
 * full-width gradients overlapping is not four orbs -- it is one pink page. The
 * matcha palette keeps every surface you actually read; this is the only place
 * the strawberry is loud, and it is under everything.
 *
 * TWO ELEMENTS PER ORB, and this is the whole reason the movement reads as
 * drifting rather than as a loop. The outer one carries the horizontal travel,
 * the inner one the vertical travel and the breathing, on a period that does not
 * divide into the outer one. The orb only returns to where it started when both
 * periods land together, which is minutes rather than seconds -- so no path is
 * ever retraced while anybody is looking at it. One element on one keyframe
 * track, however long, visibly runs on rails.
 *
 * Rendered in every theme and REVEALED BY CSS rather than by reading the active
 * theme in React. next-themes only knows which theme is on after hydration, so
 * a conditional render would blank the background for a frame on every load.
 *
 * Not a client component: nothing here has state or an event handler. The drift
 * is CSS keyframes, which cost the main thread nothing once painted.
 */
const ORBS = [
  { track: "orb-track-a", orb: "orb-a", style: { top: "-12%", left: "-14%", width: "44vmax" } },
  { track: "orb-track-b", orb: "orb-b", style: { top: "24%", right: "-16%", width: "36vmax" } },
  { track: "orb-track-c", orb: "orb-c", style: { bottom: "-14%", left: "6%", width: "40vmax" } },
  { track: "orb-track-d", orb: "orb-d", style: { top: "54%", left: "-10%", width: "30vmax" } },
];

export function StrawberryOrbs() {
  return (
    <div
      aria-hidden
      // Fixed and clipped: the orbs hang off every edge by design, and without
      // the clip they would give the page a horizontal scrollbar.
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden matcha:block"
    >
      {ORBS.map(({ track, orb, style }) => (
        <div key={orb} className={`orb-track ${track}`} style={style}>
          <div className={`orb ${orb}`} />
        </div>
      ))}
    </div>
  );
}
