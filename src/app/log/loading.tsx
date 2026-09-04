import { Skeleton } from "@/components/ui/skeleton";
import { MEALS } from "@/lib/food";

/**
 * The log tab's loading boundary.
 *
 * Present so the route can be PREFETCHED: Next skips prefetching a dynamic
 * route that has no loading boundary, and the bottom nav links here from every
 * other tab. Without it each tap was a cold server render -- the catalog, the
 * day's entries and the goal row -- with the previous screen frozen behind it.
 *
 * Shaped like the real screen so nothing jumps when the content lands: the day
 * header, the ring with its three meters, and a section per meal.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-8 rounded-md" />
      </div>

      <div className="flex flex-col items-center border-b border-border px-5 py-6">
        <Skeleton className="size-[132px] rounded-full" />

        <div className="mt-6 grid w-full grid-cols-3 gap-4">
          {["protein", "carbs", "fat"].map((macro) => (
            <div key={macro} className="flex flex-col items-center gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>

      {MEALS.map((meal) => (
        <div key={meal} className="border-b border-border px-5 pb-4 pt-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>
      ))}
    </main>
  );
}
