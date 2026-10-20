import { toast } from "sonner";

const UNDO_MS = 5000;

/**
 * Remove now, delete later. The row leaves the screen at once and the server
 * delete waits behind an Undo toast, so a mistaken swipe costs one tap rather
 * than a dialog on every intended one. Leaving the app commits straight away:
 * a delete parked in a backgrounded tab may never run.
 *
 * Returns a commit-now, for a caller about to write the same row again: a
 * parked delete that lands after the rewrite would remove the new one.
 */
export function deleteWithUndo({
  message,
  hide,
  restore,
  commit,
}: {
  message: string;
  hide: () => void;
  restore: () => void;
  commit: () => Promise<{ error: string | null }>;
}): () => void {
  hide();
  let settled = false;

  function finish() {
    if (settled) return;
    settled = true;
    document.removeEventListener("visibilitychange", onHidden);
    void commit().then((res) => {
      if (!res.error) return;
      restore();
      toast.error(res.error);
    });
  }
  function onHidden() {
    if (document.visibilityState === "hidden") finish();
  }
  document.addEventListener("visibilitychange", onHidden);

  const id = toast(message, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        settled = true;
        document.removeEventListener("visibilitychange", onHidden);
        restore();
      },
    },
    onAutoClose: finish,
    onDismiss: finish,
  });

  return () => {
    finish();
    toast.dismiss(id);
  };
}
