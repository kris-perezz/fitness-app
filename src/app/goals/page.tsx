import { createClient } from "@/lib/supabase/server";
import { GoalsForm } from "@/components/goals-form";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("nutrition_settings").select("*").maybeSingle();

  return <GoalsForm goals={data} />;
}
