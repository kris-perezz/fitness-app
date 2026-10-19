import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton blocks={[250, 96, 187, 100]} />;
}
