import { PageSkeleton } from "@/components/page-skeleton";

// Present so the route can be prefetched: Next skips prefetching a dynamic
// route that has no loading boundary, and every tab links here.
export default function Loading() {
  return <PageSkeleton blocks={[44, 263, 148, 148, 90, 90]} />;
}
