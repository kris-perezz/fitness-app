"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { lookupBarcode } from "@/app/actions";
import type { Food } from "@/lib/food";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Status =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "looking-up" }
  // The camera is unavailable for a reason the user has to act on, so the
  // message stays on screen instead of bouncing them out with a toast.
  | { kind: "blocked"; message: string };

/**
 * getUserMedia rejects with a DOMException whose `name` is the only reliable
 * part -- the message is browser-specific and unhelpful on phones.
 */
function cameraMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow the camera in your browser settings, or search for the food instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Search for the food instead.";
    case "NotReadableError":
      return "The camera is being used by another app. Close it and try again, or search for the food instead.";
    default:
      return "The camera could not be started. Search for the food instead.";
  }
}

export function BarcodeScanner({
  onFood,
  onBack,
}: {
  onFood: (food: Food) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });

  // Callbacks are read through a ref so the camera effect can run exactly once:
  // re-running it would tear down and re-acquire the stream on every render.
  const handlers = useRef({ onFood, onBack });
  useEffect(() => {
    handlers.current = { onFood, onBack };
  });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let live = true;
    // The decoder keeps firing while the video is up; only the first code wins.
    let decoded = false;

    async function lookup(code: string) {
      controls?.stop();
      if (!live) return;
      setStatus({ kind: "looking-up" });

      const res = await lookupBarcode(code);
      if (!live) return;

      if (res.source === "catalog" || res.source === "remote") {
        // Never logs directly -- the existing quantity/meal step is the confirm.
        handlers.current.onFood(res.food);
        return;
      }
      if (res.source === "miss") {
        toast.info("That product isn't in the food list yet. Try searching for it.");
      } else {
        toast.error(res.error);
      }
      handlers.current.onBack();
    }

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus({
          kind: "blocked",
          message: "This browser can't open the camera here. Search for the food instead.",
        });
        return;
      }

      try {
        // Loaded on demand: the decoder is a large bundle and most add-sheet
        // opens never reach the scanner.
        const { BarcodeFormat, BrowserMultiFormatReader } = await import("@zxing/browser");
        if (!live || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 100,
        });
        // Packaged food is 1D retail codes; narrowing the formats cuts both
        // false positives and per-frame work on a phone CPU.
        reader.possibleFormats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ];

        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result || decoded) return;
            decoded = true;
            void lookup(result.getText());
          },
        );

        // Unmounted while getUserMedia was still resolving -- the cleanup below
        // already ran, so this stream would otherwise leak the camera.
        if (!live) {
          controls.stop();
          return;
        }
        setStatus({ kind: "scanning" });
      } catch (err) {
        if (!live) return;
        setStatus({ kind: "blocked", message: cameraMessage(err) });
      }
    }

    void start();

    return () => {
      live = false;
      controls?.stop();
    };
  }, []);

  const blocked = status.kind === "blocked";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {blocked ? (
          <p className="py-6 text-sm text-muted-foreground">{status.message}</p>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                // Decorative: the reticle and the status line below carry the
                // meaning, and a live camera feed has no useful alt text.
                aria-hidden
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-8 inset-y-1/3 rounded-md border-2 border-white/70" />
              {status.kind !== "scanning" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="size-6 animate-spin text-white" />
                </div>
              )}
            </div>

            <p aria-live="polite" className="mt-4 text-center text-sm text-muted-foreground">
              {status.kind === "looking-up"
                ? "Looking up that barcode"
                : status.kind === "starting"
                  ? "Starting the camera"
                  : // There is no shutter button: the decoder reads every frame,
                    // so the only instruction that helps is where to point it.
                    "Hold the barcode inside the frame. It scans on its own."}
            </p>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-5 pt-3 pb-safe">
        <Button variant="outline" className="h-11 w-full text-base" onClick={onBack}>
          {blocked ? "Search instead" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
