/**
 * Shape shared by every surface in the app.
 *
 * The four tabs and the screens under them draw the same pane -- a translucent
 * card with one border and one shadow, blurred so the strawberry field reads
 * through it rather than stopping at the edge. It lives here because it was
 * written out at a dozen call sites, and a surface that differs by a class in
 * one of them is exactly the inconsistency it is meant to prevent.
 *
 * `ring-0` and `py-0` undo what Card brings: the registry's ring would double
 * the border, and every caller sets its own padding.
 */
export const SURFACE =
  "gap-0 border border-border/60 py-0 shadow-[var(--shadow-card)] ring-0 backdrop-blur-xl";

/**
 * The gutter, the rhythm between surfaces and the room the nav bar needs.
 *
 * `max-w-md` is the phone column every screen was designed at. From `md` up
 * the bottom bar is gone (BottomNav becomes a side rail there) so the bottom
 * clearance is dead weight, and the column widens to `max-w-3xl` -- wide
 * enough for the two-column screens (`PAGE_SPLIT`) to actually split, narrow
 * enough that a single-column screen like Profile is not a sentence stretched
 * across a monitor.
 */
export const PAGE =
  "mx-auto w-full max-w-md flex-1 space-y-2 px-2 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1 md:max-w-3xl md:px-6 md:pb-10 md:pt-8";

/**
 * `PAGE`, but as a two-column grid from `lg` up: a wide chart or calendar on
 * the left, the list it summarizes on the right, instead of the phone's
 * stacked order stretched to the same width. Below `lg` it IS `PAGE` --
 * `space-y-2` still runs the phone's single column, `grid` only takes over
 * once there is room for two.
 *
 * `content-start` alongside `items-start`, and they are not the same rule.
 * `flex-1` makes this element as tall as the viewport, and a grid with room
 * to spare stretches its ROWS to fill it -- so a full-width action in row one
 * grows to a couple of hundred pixels of nothing, with `items-start` dutifully
 * pinning the button to the top of it. `items-start` places an item inside its
 * row; `content-start` is what stops the rows being handed the slack.
 */
export const PAGE_SPLIT =
  "mx-auto w-full max-w-md flex-1 space-y-2 px-2 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1 md:max-w-3xl md:px-6 md:pb-10 md:pt-8 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_22rem] lg:content-start lg:items-start lg:gap-6 lg:space-y-0";

/** Padding inside a surface that holds a block of content rather than a list. */
export const SURFACE_PAD = "px-3.5 py-3";
