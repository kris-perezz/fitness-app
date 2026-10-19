import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton back={false} button split blocks={[132, 250, 300, 280]} />;
}
