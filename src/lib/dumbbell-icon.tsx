/**
 * The app mark: Lucide's `dumbbell`, the same icon set the rest of the UI uses
 * (`iconLibrary: "lucide"` in components.json).
 *
 * The paths are inlined rather than rendered through <Dumbbell /> because
 * Satori -- what next/og uses to rasterise these -- walks plain JSX elements
 * and does not run a React component's stroke/size prop plumbing. This is the
 * icon's own path data, copied from lucide-react's dumbbell.mjs, so it is the
 * real Lucide glyph and not an approximation of one.
 *
 * Shared by app/icon.tsx and app/apple-icon.tsx: they are separate route files
 * by Next's convention, and must not drift into two different logos.
 */

/** Lucide draws on a 24x24 grid with a 2px stroke. */
const PATHS = [
  "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
  "m2.5 21.5 1.4-1.4",
  "m20.1 3.9 1.4-1.4",
  "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
  "m9.6 14.4 4.8-4.8",
];

export function DumbbellMark({ size }: { size: number }) {
  // 60% of the canvas. The rest is the safe zone Android's maskable crop eats
  // into -- a glyph drawn edge to edge loses its corners to a circle mask.
  const glyph = Math.round(size * 0.6);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
      }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fafafa"
        // Heavier than Lucide's default 2: at 32px in a browser tab a hairline
        // dumbbell reads as a smudge.
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}
