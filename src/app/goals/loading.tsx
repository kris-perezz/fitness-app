import { Skeleton } from "@/components/ui/skeleton";

/**
 * The goals tab's loading boundary.
 *
 * Present so the route can be PREFETCHED: Next skips prefetching a dynamic
 * route that has no loading boundary, and the bottom nav links here from every
 * other tab. One settings row is a fast query, but a cold server render still
 * leaves the previous tab on screen for the whole round trip.
 *
 * The strict-mode switch decides how much of this form exists, so the skeleton
 * shows it and a few fields rather than guessing at a length it cannot know.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center border-b border-border px-5 py-3">
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="space-y-6 px-5 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>

        {[0, 1, 2].map((field) => (
          <div key={field} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
