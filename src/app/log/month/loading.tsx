import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE, SURFACE } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The month view's loading boundary.
 *
 * Present so the route can be PREFETCHED: Next skips prefetching a dynamic
 * route with no loading boundary, and the log screen's own date title links
 * here. The server work behind it is a `WINDOW_MONTHS`-wide read of
 * `intake_days`.
 *
 * Shaped like the real screen so nothing jumps when the content lands: the
 * back-chevron header, then the calendar's own footprint.
 */
export default function Loading() {
  return (
    <main className={PAGE}>
      <div className="flex items-center gap-1 px-1 py-1">
        <Skeleton className="size-11 rounded-lg" />
        <Skeleton className="h-4 w-14" />
      </div>

      <Card className={cn(SURFACE, "items-center px-1 py-2")}>
        <Skeleton className="h-[300px] w-full" />
      </Card>
    </main>
  );
}
