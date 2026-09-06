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

/** The gutter, the rhythm between surfaces and the room the nav bar needs. */
export const PAGE =
  "mx-auto w-full max-w-md flex-1 space-y-2 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1";

/** Padding inside a surface that holds a block of content rather than a list. */
export const SURFACE_PAD = "px-3.5 py-3";
