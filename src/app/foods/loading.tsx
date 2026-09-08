import { Skeleton } from "@/components/ui/skeleton";

/** Present so the route can be prefetched from the log header: Next skips
 * prefetching a dynamic route with no loading boundary. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-2 px-2 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1">
      <div className="flex items-center gap-1 px-1 py-1">
        <Skeleton className="size-11 rounded-md" />
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="px-1">
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 px-3.5 py-3">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </main>
  );
}
