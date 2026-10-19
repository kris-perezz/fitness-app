import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { PAGE } from "@/lib/ui";

export default function NotFound() {
  return (
    <main className={PAGE}>
      <Empty className="py-24">
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>It may have been deleted.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/log">Go to Food</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
