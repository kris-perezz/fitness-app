"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PAGE } from "@/lib/ui";

const RELOADED_AT = "error-reloaded-at";
const WINDOW_MS = 10_000;

// Survives the boundary remounting after its own retry fails.
let retriedAt = 0;

function reloadedRecently() {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOADED_AT)) < WINDOW_MS;
  } catch {
    return true;
  }
}

/**
 * Most failures here are a phone reopening before its network is up, or an
 * app left open across a deploy. A quiet retry covers the first; a full
 * reload fetches the new deploy's code for the second.
 */
function nextStep(): "retry" | "reload" | "give-up" {
  if (Date.now() - retriedAt > WINDOW_MS) return "retry";
  if (!reloadedRecently()) return "reload";
  return "give-up";
}

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [step] = useState(nextStep);

  useEffect(() => {
    console.error(error);
    if (step === "give-up") return;
    if (step === "reload") {
      try {
        sessionStorage.setItem(RELOADED_AT, String(Date.now()));
      } catch {}
      location.reload();
      return;
    }
    retriedAt = Date.now();
    const timer = setTimeout(retry, 1000);
    return () => clearTimeout(timer);
  }, [error, retry, step]);

  if (step !== "give-up") return null;

  return (
    <main className={PAGE}>
      <Empty className="py-24">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WifiOff />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load this page</EmptyTitle>
          <EmptyDescription>Check your connection and try again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry}>Try again</Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
