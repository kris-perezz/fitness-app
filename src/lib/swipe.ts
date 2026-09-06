"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/**
 * A horizontal swipe on a container, read from its own pointer events.
 *
 * WHY NOT A LIBRARY. This is one axis, one threshold and one step per gesture.
 * The registry's only horizontal-gesture component is `carousel`, which is a
 * slide track built on embla: it would turn a calendar or a day header into a
 * list of panes and pull a gesture engine in to page between them, for a
 * gesture that is four numbers of arithmetic.
 *
 * A SECOND WAY, NEVER THE ONLY ONE. Every caller already has arrows, a toggle
 * or a nav chevron doing the same job, and keeps them: a swipe is invisible to
 * a keyboard and to a screen reader, so it can add a path but must never be
 * the path.
 *
 * THE CONTAINER MUST SET `touch-pan-y`, or the browser claims the horizontal
 * drag for its own scrolling and the move handler never sees past the first
 * few pixels.
 */

/** Below this the gesture is a tap with a shaky thumb, not a swipe. */
export const SWIPE_PX = 40;

/**
 * Which way a drag went, or null while it is still a tap or a scroll.
 *
 * Horizontal displacement has to beat both the threshold AND the vertical
 * displacement: a diagonal drag down the page is somebody scrolling, and
 * paging the month out from under them is the worst possible reading of it.
 */
export function swipeDirection(dx: number, dy: number): "left" | "right" | null {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return null;
  return dx < 0 ? "left" : "right";
}

export type SwipeHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClickCapture: (e: MouseEvent) => void;
};

export function useSwipe({
  onLeft,
  onRight,
  enabled = true,
}: {
  /** Finger travelled leftwards -- forwards, next, later. */
  onLeft?: () => void;
  /** Finger travelled rightwards -- backwards, previous, earlier. */
  onRight?: () => void;
  enabled?: boolean;
}): SwipeHandlers {
  // The gesture is judged on its own displacement, not on which element it
  // started or ended over, so the start point is all that has to be kept
  // between pointerdown and the move that crosses the threshold.
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  return {
    onPointerDown(e) {
      // A drag that starts in a field is the user selecting what they typed.
      // Paging the screen out from under a half-entered rep count is the one
      // failure this gesture must not have.
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) {
        start.current = null;
        return;
      }
      start.current = { x: e.clientX, y: e.clientY };
      fired.current = false;
    },

    // One step per gesture: `fired` latches, so a long drag pages once rather
    // than once per frame past the threshold.
    onPointerMove(e) {
      if (!enabled || !start.current || fired.current) return;
      const dir = swipeDirection(e.clientX - start.current.x, e.clientY - start.current.y);
      if (dir === null) return;
      fired.current = true;
      // Innermost wins. A calendar inside a screen that also swipes back has
      // two handlers on one axis, and the inner one is the specific answer --
      // both run off the same pointermove, and this is the event that decides.
      e.stopPropagation();
      if (dir === "left") onLeft?.();
      else onRight?.();
    },

    onPointerUp() {
      start.current = null;
    },
    onPointerCancel() {
      start.current = null;
      fired.current = false;
    },
    // No pointer capture, so a finger that leaves the container mid-swipe just
    // ends the gesture. Capturing would be the tidier way to follow it, and it
    // is exactly what breaks taps on the buttons these containers are full of:
    // a captured pointer retargets the click to the container.
    onPointerLeave() {
      start.current = null;
    },

    // A swipe that started on a calendar day still ends with a click on that
    // day. Swallowed here rather than guarded in each child, because the
    // children are registry components and a paged month is not a chosen one.
    onClickCapture(e) {
      if (!fired.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
