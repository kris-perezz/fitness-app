import { createClient } from "@/lib/supabase/server";
import { TargetsForm } from "@/components/targets-form";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("nutrition_settings").select("*").maybeSingle();

  return <TargetsForm settings={data} />;
}
