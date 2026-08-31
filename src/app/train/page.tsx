import { Dumbbell } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export const metadata = { title: "Train" };

export default function TrainPage() {
  return (
    <SectionPlaceholder
      icon={Dumbbell}
      title="Training isn't built yet"
      description="Lifting sessions will live here: exercises, sets and reps, logged the same way food is."
    />
  );
}
