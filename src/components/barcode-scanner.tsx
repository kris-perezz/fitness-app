"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { lookupBarcode } from "@/app/actions";
import { reach } from "@/lib/reach";
import type { Food } from "@/lib/food";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Status =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "looking-up" }
  // The camera is unavailable for a reason the user has to act on, so the
  // message stays on screen instead of bouncing them out with a toast.
  | { kind: "blocked"; message: string }
  // The code read fine and the lookup did not; kept so a retry needs no rescan.
  | { kind: "failed"; code: string; message: string };

/**
 * getUserMedia rejects with a DOMException whose `name` is the only reliable
 * part -- the message is browser-specific and unhelpful on phones.
 */
function cameraMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow it in settings, or type the barcode.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found. Type the barcode instead.";
    case "NotReadableError":
      return "Another app is using the camera. Type the barcode instead.";
    default:
      return "The camera didn't start. Type the barcode instead.";
  }
}

export function BarcodeScanner({
  onFood,
  onMiss,
  onBack,
}: {
  onFood: (food: Food) => void;
  /** A readable code no database knows. The label is the way forward (S2). */
  onMiss: (barcode: string) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [typed, setTyped] = useState("");
  const live = useRef(true);

  async function lookup(code: string) {
    setStatus({ kind: "looking-up" });
    const res = await reach(lookupBarcode(code));
    if (!live.current) return;

    if (res.source === "catalog" || res.source === "remote") {
      // Never logs directly -- the existing quantity/meal step is the confirm.
      handlers.current.onFood(res.food);
      return;
    }
    // A miss is not a dead end: the code scanned fine, no database has the
    // product, and the packet with the panel on it is already in the user's
    // hand. Hand the barcode to the label reader so the food it saves is
    // found instantly on the next scan (S2, S3).
    if (res.source === "miss") {
      handlers.current.onMiss(code);
      return;
    }
    setStatus({ kind: "failed", code, message: res.error ?? "Couldn't look that up." });
  }

  // Read through a ref so the camera effect can run exactly once: re-running
  // it would tear down and re-acquire the stream on every render.
  const handlers = useRef({ onFood, onMiss, onBack, lookup });
  useEffect(() => {
    handlers.current = { onFood, onMiss, onBack, lookup };
  });

  useEffect(() => {
    let controls: IScannerControls | undefined;
    live.current = true;
    // The decoder keeps firing while the video is up; only the first code wins.
    let decoded = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus({
          kind: "blocked",
          message: "This browser can't open the camera. Type the barcode instead.",
        });
        return;
      }

      try {
        // Loaded on demand: the decoder is a large bundle and most add-sheet
        // opens never reach the scanner.
        const { BarcodeFormat, BrowserMultiFormatReader } = await import("@zxing/browser");
        if (!live.current || !videoRef.current) return;

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

        // Resolution is the whole ballgame for 1D codes. zxing decodes off a
        // canvas sized to the camera's negotiated `videoWidth`/`videoHeight`,
        // and a constraint that asks for no resolution gets whatever the phone
        // feels like -- typically 640x480. An EAN-13 held at arm's length is
        // then a few hundred pixels wide, so its narrowest bars land on one or
        // two pixels and the decoder reads nothing at all, frame after frame.
        // Asking for 1080p is what makes a retail barcode legible; `ideal`
        // rather than `exact` so a camera that cannot manage it still opens
        // instead of throwing OverconstrainedError.
        //
        // `focusMode` is not in the standard constraint set (Chrome on Android
        // honours it; browsers that don't know it discard the key), which is
        // why the object needs the cast -- without continuous autofocus a
        // phone happily holds focus at infinity while you hold a packet 15cm
        // away.
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              focusMode: { ideal: "continuous" },
            } as MediaTrackConstraints,
          },
          videoRef.current,
          (result) => {
            if (!result || decoded) return;
            decoded = true;
            controls?.stop();
            void handlers.current.lookup(result.getText());
          },
        );

        // Unmounted while getUserMedia was still resolving -- the cleanup below
        // already ran, so this stream would otherwise leak the camera.
        if (!live.current) {
          controls.stop();
          return;
        }
        setStatus({ kind: "scanning" });
      } catch (err) {
        if (!live.current) return;
        setStatus({ kind: "blocked", message: cameraMessage(err) });
      }
    }

    void start();

    return () => {
      live.current = false;
      controls?.stop();
    };
  }, []);

  const blocked = status.kind === "blocked" || status.kind === "failed";
  const code = typed.replace(/\D/g, "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {blocked ? (
          <div className="py-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {status.message}
            </p>
            {status.kind === "failed" && (
              <Button className="mt-4 h-11 w-full" onClick={() => void lookup(status.code)}>
                Try again
              </Button>
            )}
            {/* The digits under the bars, for when the camera can't be used. */}
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length >= 8) void lookup(code);
              }}
            >
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                inputMode="numeric"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Barcode number"
                aria-label="Barcode number"
                className="h-11 flex-1 text-base tabular-nums"
              />
              <Button type="submit" variant="outline" className="h-11" disabled={code.length < 8}>
                Look up
              </Button>
            </form>
          </div>
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
                  {/* Hidden from assistive tech: Spinner carries role="status",
                      and the aria-live line below already announces the same
                      state in words. */}
                  <Spinner aria-hidden className="size-6 text-white" />
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
