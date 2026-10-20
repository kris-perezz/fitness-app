import type { createClient } from "@/lib/supabase/server";
import { estimateExpenditure, type Expenditure } from "@/lib/expenditure";
import { trendsWindow } from "@/lib/trends";
import { shiftDays, toWeighIn } from "@/lib/weight";

const HISTORY_DAYS = 120;

/**
 * The estimate for a strict-mode account that opted in, else null.
 *
 * Reads its own flags and fetches the history alongside them, so a page can
 * run it in parallel with its other queries; the history is cheap to discard
 * when the feature is off. Today is left out: it is unfinished, and a
 * half-logged day would read as a deficit.
 */
export async function loadExpenditure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  today: string,
): Promise<{ enabled: boolean; estimate: Expenditure | null }> {
  const yesterday = shiftDays(today, -1);
  const { from } = trendsWindow(today, HISTORY_DAYS);
  const [flags, intake, weighIns] = await Promise.all([
    supabase.from("nutrition_settings").select("strict_mode, expenditure_enabled").maybeSingle(),
    supabase.from("intake_days").select("log_date, kcal, item_count").gte("log_date", from).lte("log_date", yesterday),
    supabase.from("weigh_ins").select("log_date, weight_lb, note").gte("log_date", from).lte("log_date", yesterday).order("log_date"),
  ]);
  if (flags.error || flags.data?.strict_mode !== true || flags.data?.expenditure_enabled !== true) {
    return { enabled: false, estimate: null };
  }
  if (intake.error || weighIns.error) return { enabled: true, estimate: null };
  return {
    enabled: true,
    estimate: estimateExpenditure((weighIns.data ?? []).map(toWeighIn), intake.data ?? [], yesterday),
  };
}
