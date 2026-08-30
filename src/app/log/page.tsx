import { createClient } from "@/lib/supabase/server";
import { wakingDate, type Food } from "@/lib/food";
import { LogScreen } from "@/components/log-screen";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: requested } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : wakingDate();

  const supabase = await createClient();

  const [{ data: foods }, { data: entries }, { data: goals }] = await Promise.all([
    supabase.from("foods").select("*").order("name"),
    supabase
      .from("intake_entries")
      .select("*")
      .eq("log_date", date)
      .order("created_at", { ascending: true }),
    supabase.from("nutrition_settings").select("*").maybeSingle(),
  ]);

  return (
    <LogScreen date={date} foods={(foods ?? []) as Food[]} entries={entries ?? []} goals={goals} />
  );
}
