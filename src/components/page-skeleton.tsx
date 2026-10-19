import { Skeleton } from "@/components/ui/skeleton";
import { PAGE, PAGE_SPLIT } from "@/lib/ui";

/**
 * Loading screens drawn from the same page containers as the screens they
 * stand in for, with block heights measured off the real screens at phone
 * width, so nothing jumps when the content lands.
 */
export function PageSkeleton({
  back = true,
  button = false,
  split = false,
  blocks,
}: {
  /** A back chevron and title, as on every stacked screen. */
  back?: boolean;
  /** The full-width primary button the tab screens open with. */
  button?: boolean;
  split?: boolean;
  /** Heights in px, top to bottom. */
  blocks: number[];
}) {
  return (
    <main className={split ? PAGE_SPLIT : PAGE} aria-busy="true">
      {back && (
        <div className="flex h-[52px] items-center gap-2 px-1 py-1 lg:col-span-2">
          <Skeleton className="size-11 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
      )}
      {button && (
        <div className="pt-1 lg:col-span-2">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}
      {blocks.map((height, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ height }} />
      ))}
    </main>
  );
}
