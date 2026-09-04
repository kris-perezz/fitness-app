/**
 * The calorie ring's geometry, and the one thing about it that is not fixed:
 * how big the figure in the middle is allowed to be.
 *
 * EVERYTHING HERE IS PIXELS, deliberately. The ring is drawn at a pixel size,
 * so a figure sized in `rem` grows with the reader's browser font setting
 * inside a circle that does not -- which is the number touching the arc on a
 * phone that renders it perfectly on a desktop.
 */

export const RING_SIZE = 132;
export const RING_STROKE = 10;
export const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The figure at its largest, and the floor it may never shrink past. */
export const RING_FIGURE_PX = 30;
const MIN_FIGURE_PX = 18;

/** The caption under the figure: its own size, and the gap above it. */
export const RING_CAPTION_PX = 12;
export const RING_CAPTION_LINE_PX = 16;
const CAPTION_GAP_PX = 4;

/** Clear space inside the arc, from one inner edge to the other. */
const INNER_RADIUS = RING_RADIUS - RING_STROKE / 2;

/**
 * The figure sits ABOVE the centre, because its caption is under it -- so the
 * room it has is a chord rather than the diameter, and the chord is narrowest
 * at the figure's top line.
 *
 * Measured there, at full size, and then held: a figure that shrinks only ever
 * gains room, and a rule that gave one number more space than another would be
 * a layout you cannot reason about from the numbers alone.
 */
const TOP_OFFSET = (RING_FIGURE_PX + CAPTION_GAP_PX + RING_CAPTION_LINE_PX) / 2;
const CHORD = 2 * Math.sqrt(INNER_RADIUS ** 2 - TOP_OFFSET ** 2);

/** Breathing room on each side. Touching the arc is the thing being fixed. */
const SIDE_PADDING = 6;
const AVAILABLE = CHORD - 2 * SIDE_PADDING;

/**
 * Advance width in ems. Tabular figures make every digit the same width, which
 * is what makes this arithmetic rather than a measurement; a thousands
 * separator is much narrower and is the only other thing a formatted calorie
 * count contains.
 */
const DIGIT_EM = 0.6;
const SEPARATOR_EM = 0.28;

function widthEm(label: string): number {
  let em = 0;
  for (const char of label) em += /\d/.test(char) ? DIGIT_EM : SEPARATOR_EM;
  return em;
}

/**
 * The size to set the ring's figure at, in pixels, so that it fits.
 *
 * Sized from the STRING, after formatting, because the separator is what makes
 * a five-figure count wider than its digits alone -- and because a locale that
 * groups differently changes the answer.
 */
export function ringFontSize(label: string): number {
  const em = widthEm(label);
  if (em <= 0) return RING_FIGURE_PX;
  // Down to a tenth of a pixel: rounding to whole pixels throws away room the
  // widest labels need, and subpixel type is what browsers render anyway.
  const fitted = Math.floor((AVAILABLE / em) * 10) / 10;
  return Math.max(MIN_FIGURE_PX, Math.min(RING_FIGURE_PX, fitted));
}

/** What `ringFontSize` believes it is fitting into. Exported for its test. */
export const RING_AVAILABLE_PX = AVAILABLE;

/** The rendered width of a label at a size, by the same estimate. */
export function ringLabelWidth(label: string, fontPx: number): number {
  return widthEm(label) * fontPx;
}
