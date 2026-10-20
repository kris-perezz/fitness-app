import type { createClient } from "@/lib/supabase/server";
import { estimateExpenditure, type Expenditure } from "@/lib/expenditure";
import { trendsWindow } from "@/lib/trends";
import { shiftDays, toWeighIn } from "@/lib/weight";

const HISTORY_DAYS = 120;

/**
 * The estimate for a strict-mode account that opted in, else null.
 *
 * The flag is its own select so an account that has not run the migration
 * reads as off instead of failing the whole page. Today is left out: it is
 * unfinished, and a half-logged day would read as a deficit.
 */
export async function loadExpenditure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  today: string,
  strict: boolean,
): Promise<{ enabled: boolean; estimate: Expenditure | null }> {
  if (!strict) return { enabled: false, estimate: null };
  const flag = await supabase.from("nutrition_settings").select("expenditure_enabled").maybeSingle();
  if (flag.error || flag.data?.expenditure_enabled !== true) return { enabled: false, estimate: null };

  const yesterday = shiftDays(today, -1);
  const { from } = trendsWindow(today, HISTORY_DAYS);
  const [intake, weighIns] = await Promise.all([
    supabase.from("intake_days").select("log_date, kcal, item_count").gte("log_date", from).lte("log_date", yesterday),
    supabase.from("weigh_ins").select("log_date, weight_lb, note").gte("log_date", from).lte("log_date", yesterday).order("log_date"),
  ]);
  if (intake.error || weighIns.error) return { enabled: true, estimate: null };
  return {
    enabled: true,
    estimate: estimateExpenditure((weighIns.data ?? []).map(toWeighIn), intake.data ?? [], yesterday),
  };
}
