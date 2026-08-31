import { Skeleton } from "@/components/ui/skeleton";

/**
 * The train tab's loading boundary.
 *
 * It briefly existed to make the route prefetchable -- Next skips prefetching a
 * dynamic route without one -- but the month no longer navigates at all, so
 * there is nothing left to prefetch. What remains is the plain reason: this
 * page now fetches the WHOLE history in one go so that paging months costs
 * nothing afterwards, and that one fetch deserves something better than the
 * previous screen sitting there.
 *
 * Shaped like the real screen rather than a generic spinner, so nothing jumps
 * when the content lands -- the header, the primary action, the calendar and
 * the chart each keep their own footprint.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-12 w-full" />
      </div>

      <div className="border-b border-border px-5 py-3">
        <Skeleton className="h-[290px] w-full" />
      </div>

      <div className="border-b border-border px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="mt-3 h-[340px] w-full" />
      </div>
    </main>
  );
}
