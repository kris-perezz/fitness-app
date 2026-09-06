"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Ask before destroying something.
 *
 * This exists because the app was inconsistent about it: deleting a recipe
 * asked, while deleting a set, removing an exercise, removing an ingredient and
 * deleting a food entry all fired on the first tap. Inconsistency is the actual
 * problem -- a user cannot learn "this app confirms" or "this app does not" if
 * the answer changes per screen, so they end up trusting neither.
 *
 * Composition over markup: every piece here is the registry's AlertDialog. What
 * is shared is the DECISION to ask and the wording of the two buttons, not any
 * styling.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  open,
  onOpenChange,
}: {
  /**
   * What the user presses to get here. Omitted when the dialog is opened by a
   * gesture instead -- a swipe has no element of its own to hang a trigger on.
   */
  trigger?: ReactNode;
  title: string;
  /** What is lost, in one sentence. Say the consequence, not "are you sure?". */
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /**
   * Controlled only when something outside opens it. Left undefined the
   * dialog stays uncontrolled and the trigger drives it, exactly as before.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
