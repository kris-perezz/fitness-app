import { createClient, must } from "@/lib/supabase/server";
import { loadExpenditure } from "@/lib/expenditure-load";
import { serverToday } from "@/lib/server-time";
import { GoalsForm } from "@/components/goals-form";

export const metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const [settings, { enabled, estimate }] = await Promise.all([
    supabase.from("nutrition_settings").select("*").maybeSingle(),
    serverToday().then((today) => loadExpenditure(supabase, today)),
  ]);
  const data = must(settings);

  const { data: auth } = await supabase.auth.getClaims();
  const email = typeof auth?.claims.email === "string" ? auth.claims.email : null;

  return <GoalsForm goals={data} email={email} expenditure={{ enabled, estimate }} />;
}
