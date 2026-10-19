import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/next-path";

/**
 * Handles both shapes Supabase can send back:
 *   ?code=...                     PKCE, the default for signInWithOtp
 *   ?token_hash=...&type=email    when the email template uses {{ .TokenHash }}
 * Failures arrive in the URL fragment instead, which only the browser can read
 * -- the login page picks those up.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    console.error("auth confirm failed", error.message);
    redirect("/login?error=link");
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(type === "recovery" ? "/reset-password" : next);
    console.error("auth confirm failed", error.message);
    redirect("/login?error=link");
  }

  redirect("/login?error=link");
}
