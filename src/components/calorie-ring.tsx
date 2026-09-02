import { fillPercent, isAlarming, ringFigure, statusOf, type Tone } from "@/lib/tone";

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
  tone = "calm",
}: {
  consumed: number;
  goal: number;
  /** S75. Read at render time and stored nowhere (S77). */
  tone?: Tone;
}) {
  // Only for the strict overshoot line below; the figure in the middle of the
  // ring is decided by `ringFigure`.
  const remaining = goal - consumed;
  // S70/S74. The ring no longer decides what its own number means: calories are
  // a TARGET, and in calm mode going past one is a fact rather than an alarm.
  // What changes past the goal is the figure and its caption -- the ring turns
  // from what is left into what was eaten (S78) -- and not the colour. Red stays
  // reserved for destructive actions and for the one genuine health limit
  // (S73), which is not this.
  const status = statusOf("calories", consumed, goal, true);
  const alarming = isAlarming("calories", status, tone);
  // S79. Calm shows what was eaten; only strict counts down. And past the goal
  // neither of them subtracts (S78) -- strict says it in the red line below.
  const { value: figure, caption } = ringFigure(consumed, goal, tone);
  // Clamped so an overshoot fills the ring rather than winding past the start.
  const fraction = fillPercent(consumed, goal) / 100;

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
            className={alarming ? "stroke-destructive" : "stroke-primary"}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-3xl leading-none font-semibold tabular-nums ${
              alarming ? "text-destructive" : ""
            }`}
          >
            {figure.toLocaleString()}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            {/* The unit rides along for a screen reader in both tones. Calm
                drops the `x of y cal` line below, which used to be the only
                place the word appeared in the accessible content. */}
            {caption} <span className="sr-only">calories</span>
          </span>
        </div>
      </div>

      {/* S76. COLOUR IS NEVER THE ONLY CARRIER: strict states the overshoot in
          words as well, so the mode survives greyscale, colour blindness and a
          screen reader. Calm leaves the arithmetic to the reader, which is the
          difference between the two modes rather than a second feature. */}
      {alarming && (
        <p className="mt-2 text-xs font-medium tabular-nums text-destructive">
          over by {Math.abs(remaining).toLocaleString()}
        </p>
      )}

      {/* S79. THE GOAL IS A STRICT-MODE IDEA. `x of y` is a fraction, and a
          fraction is a score whatever colour it is painted -- the same reason
          the macros under this ring stopped showing one. Calm keeps the arc,
          which carries the shape of the day without putting a number on how
          well you did at it, and the goal is still one tap away on Goals. */}
      {tone === "strict" && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {consumed.toLocaleString()} of {goal.toLocaleString()} cal
        </p>
      )}
    </div>
  );
}
