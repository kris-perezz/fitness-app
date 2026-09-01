import type { FocusEvent } from "react";

type SetSnap = (snap: number | string | null) => void;

/**
 * Take a snapped drawer to full height the moment anything inside it is
 * focused.
 *
 * A drawer sitting at its 60% snap point is a full-height panel translated
 * down: the part below the fold is off-screen, and the software keyboard then
 * eats the bottom of what is left. Tapping the search field at 60% therefore
 * pushed the field itself out of view, and pinned footers -- the Add button --
 * ended up behind the keyboard. Dragging the sheet up first fixed it, which is
 * a workaround the user should never have had to find.
 *
 * Going to full height on focus gives the keyboard the whole lower half to take
 * and leaves the field and the footer inside what remains. It is `onFocusCapture`
 * on the drawer content rather than a handler per input, so every step of every
 * sheet gets it and no future field can forget to.
 */
export function liftForKeyboard(setSnap: SetSnap) {
  return (event: FocusEvent<HTMLElement>) => {
    const el = event.target;
    // Buttons and the drawer's own focus trap are not a keyboard; only fields
    // that summon one should move the sheet.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setSnap(1);
    }
  };
}
