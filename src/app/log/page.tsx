import { createClient } from "@/lib/supabase/server";
import { wakingDate, type Food } from "@/lib/food";
import { LogScreen } from "@/components/log-screen";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const supabase = await createClient();
  const date = wakingDate();

  const [{ data: foods }, { data: entries }, { data: settings }] = await Promise.all([
    supabase.from("foods").select("*").order("name"),
    supabase
      .from("intake_entries")
      .select("*")
      .eq("log_date", date)
      .order("created_at", { ascending: true }),
    supabase.from("nutrition_settings").select("*").maybeSingle(),
  ]);

  return (
    <LogScreen
      date={date}
      foods={(foods ?? []) as Food[]}
      entries={entries ?? []}
      settings={settings}
    />
  );
}
