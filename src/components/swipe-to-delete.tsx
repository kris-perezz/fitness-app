"use client";

import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-action";
import { cn } from "@/lib/utils";

/**
 * Drag a row leftwards to start deleting it.
 *
 * WHY NOT THE REGISTRY. There is no swipe-to-delete item in it -- `carousel`
 * is the only component that reads a horizontal drag at all, and it is a slide
 * track for panes of content, not a row that gives way under a thumb. This is
 * the shape it would have to be hand-rolled into anyway.
 *
 * IT OPENS THE SAME DIALOG THE BUTTON DOES. A swipe is easy to do by accident
 * in a pocket or on a scroll, and this app already decided (confirm-action.tsx)
 * that inconsistent confirmation is the thing users cannot learn around. So the
 * gesture is a way to REACH the question, never a way to skip it, and the row's
 * own delete button stays exactly where it was -- keyboards and screen readers
 * have no swipe.
 *
 * NO PLATE UNDER THE ROW. The usual red panel revealed behind a sliding row
 * assumes the row is opaque, and `--card` in this theme is 72%: red would show
 * straight through the text. The mark sits in the gap the row leaves instead,
 * fading in as the gap opens.
 */

/** How far the row can travel. Past it the drag stops moving anything. */
const MAX_PX = 96;
/** Past this on release, the question gets asked. */
const TRIGGER_PX = 64;
/** Leftward slack before a drag counts as this gesture rather than a scroll. */
const ENGAGE_PX = 8;

export function SwipeToDelete({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
}: {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [asking, setAsking] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Three states, because "not this gesture" has to be remembered for the rest
  // of the drag: a scroll that happens to drift left must not become a swipe
  // fifty pixels later.
  const engaged = useRef<null | boolean>(null);
  // The distance again, as a ref. `offset` drives the transform and cannot be
  // read on release: a pointermove is a continuous event, so its state update
  // is not guaranteed to have committed before pointerup runs, and a fast flick
  // would be judged on the frame before it.
  const travelled = useRef(0);

  function end() {
    start.current = null;
    setDragging(false);
    // Always back to rest. A row left sitting open is a second, undismissable
    // state to explain, and the dialog is already the thing being asked.
    setOffset(0);
    if (engaged.current && Math.abs(travelled.current) >= TRIGGER_PX) setAsking(true);
    travelled.current = 0;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-5 text-destructive"
        style={{ opacity: Math.min(1, Math.abs(offset) / TRIGGER_PX) }}
      >
        <Trash2 className="size-5" />
      </div>

      <div
        className={cn("relative touch-pan-y", !dragging && "transition-transform duration-200")}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (disabled) return;
          // A drag that starts in a field is the user selecting what they
          // typed -- the quantity box on a recipe ingredient, for one.
          if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
          start.current = { x: e.clientX, y: e.clientY };
          engaged.current = null;
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          if (engaged.current === null) {
            if (Math.abs(dy) > Math.abs(dx)) engaged.current = false;
            else if (dx < -ENGAGE_PX) {
              engaged.current = true;
              setDragging(true);
            }
          }
          if (!engaged.current) return;
          // The page under this row may be swiping days or months on the same
          // axis. Once the row has the gesture, it keeps it.
          e.stopPropagation();
          // Leftwards only, and it stops rather than stretching: rightwards is
          // where the row already is, and there is nothing on that side.
          travelled.current = Math.max(-MAX_PX, Math.min(0, dx));
          setOffset(travelled.current);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        // The row underneath is a button on every screen that uses this, so a
        // swipe that ends on it would also open whatever it opens.
        onClickCapture={(e) => {
          if (!engaged.current) return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </div>

      <ConfirmAction
        open={asking}
        onOpenChange={setAsking}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
      />
    </div>
  );
}
