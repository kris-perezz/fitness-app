import { createClient, must } from "@/lib/supabase/server";
import { GoalsForm } from "@/components/goals-form";

export const metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const data = must(await supabase.from("nutrition_settings").select("*").maybeSingle());

  const { data: auth } = await supabase.auth.getClaims();
  const email = typeof auth?.claims.email === "string" ? auth.claims.email : null;

  return <GoalsForm goals={data} email={email} />;
}
