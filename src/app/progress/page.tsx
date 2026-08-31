import { TrendingUp } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export const metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <SectionPlaceholder
      icon={TrendingUp}
      title="Progress isn't built yet"
      description="Weight and measurements over time, once there is enough logged history to be worth charting."
    />
  );
}
