/**
 * The strawberry half of the strawberry matcha theme: a drifting pink field,
 * with the pearls sitting in it the way they sit in a glass.
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
 * PEARLS SINK. Tapioca is denser than what it is sitting in, so it goes to the
 * bottom and stays there; the only pearls in motion are the ones still on their
 * way down after the last shake. The bed rests on top of the nav bar, which is
 * where the glass ends.
 *
 * Every value here is hand-set rather than generated. A random layout would
 * differ between the server render and the client one, and React would throw the
 * whole tree away and rebuild it on load.
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
 * The settled layer. `lift` is how far off the floor a pearl has come to rest,
 * which is what makes it a heap rather than a row -- pearls land on each other,
 * not side by side. Big ones sit low; sago fills the gaps between them.
 */
const BED = [
  { kind: "boba", left: "3%", size: 17, lift: 0, bob: "bob-a" },
  { kind: "sago", left: "11%", size: 8, lift: 15, bob: "bob-c" },
  { kind: "boba", left: "14%", size: 15, lift: 2, bob: "bob-b" },
  { kind: "boba", left: "23%", size: 18, lift: 0, bob: "bob-c" },
  { kind: "sago", left: "31%", size: 7, lift: 17, bob: "bob-a" },
  { kind: "boba", left: "34%", size: 14, lift: 3, bob: "bob-a" },
  { kind: "boba", left: "43%", size: 16, lift: 0, bob: "bob-b" },
  { kind: "sago", left: "50%", size: 9, lift: 14, bob: "bob-b" },
  { kind: "boba", left: "54%", size: 15, lift: 2, bob: "bob-c" },
  { kind: "boba", left: "63%", size: 17, lift: 0, bob: "bob-a" },
  { kind: "sago", left: "70%", size: 7, lift: 16, bob: "bob-c" },
  { kind: "boba", left: "74%", size: 14, lift: 3, bob: "bob-b" },
  { kind: "boba", left: "83%", size: 16, lift: 0, bob: "bob-c" },
  { kind: "sago", left: "90%", size: 8, lift: 13, bob: "bob-a" },
  { kind: "boba", left: "93%", size: 15, lift: 1, bob: "bob-a" },
];

/**
 * The few still on their way down. Slow, because a pearl falling through a thick
 * drink is slow, and staggered so the bed is never watched settling all at once.
 */
const SINKING = [
  { kind: "boba", left: "19%", size: 15, fall: 26, delay: -4, drift: "drift-a" },
  { kind: "sago", left: "47%", size: 8, fall: 34, delay: -19, drift: "drift-b" },
  { kind: "boba", left: "68%", size: 16, fall: 29, delay: -11, drift: "drift-b" },
  { kind: "sago", left: "86%", size: 7, fall: 38, delay: -27, drift: "drift-a" },
];

export function StrawberryOrbs() {
  return (
    <div
      aria-hidden
      // Fixed and clipped: the orbs hang off every edge by design and the
      // sinking pearls start above the top one. Without the clip both would give
      // the page a scrollbar.
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden matcha:block"
    >
      {ORBS.map(({ track, orb, style }) => (
        <div key={orb} className={`orb-track ${track}`} style={style}>
          <div className={`orb ${orb}`} />
        </div>
      ))}

      {SINKING.map(({ kind, left, size, fall, delay, drift }) => (
        <div
          key={`fall-${left}`}
          className="pearl-fall"
          style={{
            left,
            width: size,
            animationDuration: `${fall}s`,
            animationDelay: `${delay}s`,
          }}
        >
          <div className={`pearl pearl-${kind} ${drift}`} />
        </div>
      ))}

      <div className="pearl-bed">
        {BED.map(({ kind, left, size, lift, bob }) => (
          <div
            key={`bed-${left}`}
            className={`pearl pearl-${kind} ${bob}`}
            style={{ left, width: size, height: size, bottom: lift }}
          />
        ))}
      </div>
    </div>
  );
}
