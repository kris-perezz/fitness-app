import { sourceLabel, type FoodSource } from "@/lib/food";
import { Badge } from "@/components/ui/badge";

/**
 * S6. Where a food's numbers came from, in the two words a person needs to
 * decide how much salt to take them with.
 *
 * Only the untrustworthy end of the hierarchy is loud. A label transcription
 * and the hand-checked seed set are the normal case, so they get the quiet
 * outline; an unconfirmed Open Food Facts row is the one worth noticing, and it
 * is the only one that carries a colour. A recipe is neither -- it is computed,
 * and saying so is information rather than a warning.
 */
const VARIANT: Record<FoodSource, "outline" | "secondary" | "destructive"> = {
  label: "outline",
  seed: "outline",
  manual: "outline",
  recipe: "secondary",
  off: "destructive",
};

export function FoodSourceBadge({
  source,
  className,
}: {
  source: FoodSource;
  className?: string;
}) {
  return (
    <Badge variant={VARIANT[source]} className={className}>
      {sourceLabel(source)}
    </Badge>
  );
}
