/**
 * Calories as an arc, with the number that actually gets read -- what's left --
 * in the middle.
 *
 * Hand-rolled SVG on purpose: a charting library would be tens of kilobytes to
 * draw one circle, and this needs no axes, tooltips or responsiveness beyond a
 * viewBox.
 */
const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CalorieRing({
  consumed,
  goal,
}: {
  consumed: number;
  goal: number;
}) {
  const remaining = goal - consumed;
  const over = remaining < 0;
  // Clamped so an overshoot fills the ring rather than winding past the start.
  const fraction = goal > 0 ? Math.min(1, Math.max(0, consumed / goal)) : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          // The figures below are the accessible content; the arc restates them.
          aria-hidden
          // Start the arc at 12 o'clock instead of 3.
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-muted"
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            className={over ? "stroke-destructive" : "stroke-primary"}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-3xl leading-none font-semibold tabular-nums ${
              over ? "text-destructive" : ""
            }`}
          >
            {Math.abs(remaining).toLocaleString()}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            {over ? "over" : "left"}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground tabular-nums">
        {consumed.toLocaleString()} of {goal.toLocaleString()} cal
      </p>
    </div>
  );
}
