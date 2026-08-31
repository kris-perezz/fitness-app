import { Skeleton } from "@/components/ui/skeleton";

/**
 * The session screen's loading boundary.
 *
 * Present mostly so the route can be PREFETCHED: Next skips prefetching a
 * dynamic route that has no loading boundary, and every session in the month
 * list is a link to this one. Without this file each tap was a cold server
 * render -- the two history RPCs and a sets query -- before anything appeared.
 *
 * It does not help the other way in: tapping an untrained day creates the
 * session first, and a page whose id does not exist yet cannot be fetched
 * ahead of time.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-24 w-full" />
      </div>

      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-24 w-full" />
      </div>

      <div className="px-5 py-4">
        <Skeleton className="h-11 w-full" />
      </div>
    </main>
  );
}
