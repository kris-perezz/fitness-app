import { Skeleton } from "@/components/ui/skeleton";

/**
 * The progress tab's loading boundary.
 *
 * Present so the route can be PREFETCHED: Next skips prefetching a dynamic
 * route that has no loading boundary, and the bottom nav links here from every
 * other tab. The server work behind it is a three-month window of weigh-ins,
 * the settings row and, when one is pinned, a lift's whole history.
 *
 * Shaped like the real screen so nothing jumps when the content lands: the
 * weigh-in action on top, the trend headline, the chart and the month list.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-12 w-full" />
      </div>

      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-9 w-40" />
        <Skeleton className="mt-2 h-3 w-32" />
      </div>

      <div className="border-b border-border px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="mt-3 h-[180px] w-full" />
      </div>

      <div className="px-5 py-4">
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
