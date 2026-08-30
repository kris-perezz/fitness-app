import { cn } from "@/lib/utils";

/**
 * A measuring rule, not a progress bar. Square ends, one tick at the target,
 * and the overflow reads as a separate segment past the tick rather than a
 * bar that silently pins at 100%.
 */
export function Gauge({
  value,
  target,
  state,
}: {
  value: number;
  target: number | null;
  state: "neutral" | "over" | "under";
}) {
  if (target === null) return <div className="h-px w-full bg-border" />;

  const pct = Math.min(100, (value / target) * 100);
  const over = value > target;

  return (
    <div className="relative h-1.5 w-full">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      <div
        className={cn(
          "absolute left-0 top-1/2 h-0.5 -translate-y-1/2 transition-[width] duration-300",
          state === "over" && "bg-destructive",
          state === "under" && "bg-amber-600",
          state === "neutral" && "bg-foreground",
        )}
        style={{ width: `${pct}%` }}
      />
      {over && (
        <div className="absolute right-0 top-1/2 h-1.5 w-px -translate-y-1/2 bg-destructive" />
      )}
      <div className="absolute right-0 top-1/2 h-1.5 w-px -translate-y-1/2 bg-foreground/30" />
    </div>
  );
}
