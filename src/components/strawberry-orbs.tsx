/**
 * The strawberry half of the strawberry matcha theme: a drifting pink field,
 * and the pearls sitting in it.
 *
 * ORBS. Three pink shapes behind the whole app, kept SMALLER THAN THE SCREEN
 * and given a solid core before the falloff -- three soft full-width gradients
 * overlapping is not three orbs, it is one pink page. The matcha palette keeps
 * every surface you actually read; this is the only place the strawberry is
 * loud, and it is under everything.
 *
 * TWO ELEMENTS PER ORB, and this is the whole reason the movement reads as
 * drifting rather than as a loop. The outer one carries the horizontal travel,
 * the inner one the vertical travel and the breathing, on a period that does not
 * divide into the outer one. The orb only returns to where it started when both
 * periods land together, which is minutes rather than seconds -- so no path is
 * ever retraced while anybody is looking at it. One element on one keyframe
 * track, however long, visibly runs on rails.
 *
 * PEARLS. Boba and sago rising through it, the way they do when a drink has just
 * been shaken. Same two-element trick: the column rises, the pearl inside sways.
 * They are small, few and faint on purpose -- this sits under a calorie ring and
 * five chart series, and anything that pulls the eye off those has cost more
 * than it gave.
 *
 * Every value here is hand-set rather than generated. A random layout would
 * differ between the server render and the client one, and React would throw
 * the whole tree away and rebuild it on load.
 *
 * Rendered in every theme and REVEALED BY CSS rather than by reading the active
 * theme in React. next-themes only knows which theme is on after hydration, so
 * a conditional render would blank the background for a frame on every load.
 *
 * Not a client component: nothing here has state or an event handler. All of it
 * is CSS keyframes, which cost the main thread nothing once painted.
 */
const ORBS = [
  { track: "orb-track-a", orb: "orb-a", style: { top: "-12%", left: "-14%", width: "44vmax" } },
  { track: "orb-track-b", orb: "orb-b", style: { top: "24%", right: "-16%", width: "36vmax" } },
  { track: "orb-track-c", orb: "orb-c", style: { bottom: "-14%", left: "6%", width: "40vmax" } },
];

/**
 * `left` is where the column sits, `size` is the pearl in it, and the two
 * durations are the rise and the sway. Boba are the big dark ones; sago are the
 * small pale ones, and there are more of them, which is how the drink looks.
 */
const PEARLS = [
  { kind: "boba", left: "8%", size: 15, rise: 44, delay: -3, sway: "sway-a" },
  { kind: "boba", left: "27%", size: 12, rise: 57, delay: -21, sway: "sway-b" },
  { kind: "boba", left: "52%", size: 17, rise: 39, delay: -12, sway: "sway-c" },
  { kind: "boba", left: "71%", size: 13, rise: 63, delay: -35, sway: "sway-a" },
  { kind: "boba", left: "89%", size: 16, rise: 49, delay: -8, sway: "sway-b" },
  { kind: "sago", left: "15%", size: 7, rise: 34, delay: -17, sway: "sway-c" },
  { kind: "sago", left: "35%", size: 6, rise: 41, delay: -29, sway: "sway-a" },
  { kind: "sago", left: "44%", size: 8, rise: 29, delay: -5, sway: "sway-b" },
  { kind: "sago", left: "62%", size: 6, rise: 47, delay: -24, sway: "sway-c" },
  { kind: "sago", left: "78%", size: 7, rise: 37, delay: -14, sway: "sway-a" },
  { kind: "sago", left: "95%", size: 5, rise: 53, delay: -41, sway: "sway-b" },
];

export function StrawberryOrbs() {
  return (
    <div
      aria-hidden
      // Fixed and clipped: the orbs hang off every edge by design, and the
      // pearls start below the fold and finish above it. Without the clip both
      // would give the page a scrollbar.
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden matcha:block"
    >
      {ORBS.map(({ track, orb, style }) => (
        <div key={orb} className={`orb-track ${track}`} style={style}>
          <div className={`orb ${orb}`} />
        </div>
      ))}

      {PEARLS.map(({ kind, left, size, rise, delay, sway }) => (
        <div
          key={`${kind}-${left}`}
          className="pearl-column"
          style={{
            left,
            width: size,
            animationDuration: `${rise}s`,
            animationDelay: `${delay}s`,
          }}
        >
          <div className={`pearl pearl-${kind} ${sway}`} />
        </div>
      ))}
    </div>
  );
}
