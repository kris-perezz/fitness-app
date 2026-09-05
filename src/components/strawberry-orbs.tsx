/**
 * The strawberry half of the strawberry matcha theme.
 *
 * Three pink shapes behind the whole app, kept SMALLER THAN THE SCREEN and given
 * a soft core before the falloff -- three full-width gradients overlapping is
 * not three orbs, it is one pink page. The matcha palette keeps every surface
 * you actually read; this is the only place the strawberry is loud, and it is
 * under everything.
 *
 * THEY ARE ELLIPSES, NOT CIRCLES, and they turn. A blurred circle is a blurred
 * circle from every angle, so a drifting one only ever looks like a moving blob;
 * an ellipse on a slow rotation changes its own silhouette as it goes, which is
 * what reads as light rather than as an object.
 *
 * TWO ELEMENTS PER ORB, and this is the whole reason the movement reads as
 * drifting rather than as a loop. The outer one carries the horizontal travel
 * and the rotation, the inner one the vertical travel and the breathing, on a
 * period that does not divide into the outer one. The orb only returns to where
 * it started when both periods land together, which is minutes rather than
 * seconds -- so no path is retraced while anybody is looking at it. One element
 * on one keyframe track, however long, visibly runs on rails.
 *
 * THE GRAIN IS NOT DECORATION. A wide, soft, low-contrast gradient is exactly
 * the case 8-bit colour cannot describe: the steps between neighbouring tones
 * land far enough apart to draw visible rings, and phones are the worst of it.
 * A little noise scatters the boundary between two bands so neither one has an
 * edge. It is a static layer -- painted once, never animated.
 *
 * Rendered in every theme and REVEALED BY CSS rather than by reading the active
 * theme in React. next-themes only knows which theme is on after hydration, so
 * a conditional render would blank the background for a frame on every load.
 *
 * Not a client component: nothing here has state or an event handler. All of it
 * is CSS keyframes, which cost the main thread nothing once painted.
 */
const ORBS = [
  { track: "orb-track-a", orb: "orb-a", style: { top: "-16%", left: "-18%", width: "58vmax" } },
  { track: "orb-track-b", orb: "orb-b", style: { top: "18%", right: "-20%", width: "46vmax" } },
  { track: "orb-track-c", orb: "orb-c", style: { bottom: "-18%", left: "2%", width: "52vmax" } },
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
      <div className="orb-grain" />
    </div>
  );
}
