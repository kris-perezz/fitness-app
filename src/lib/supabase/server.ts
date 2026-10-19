import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * A read's data, or a throw to the route's error screen. A failed read must
 * never render as an empty day, which invites logging everything again.
 */
export function must<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  // 22P02: a malformed id in the address, which is a missing page, not an outage.
  if (result.error?.code === "22P02") notFound();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/**
 * Who is asking, from the session token itself. With asymmetric signing keys
 * this is verified locally; with the legacy shared secret it falls back to
 * asking Supabase over the network, like `getUser()`.
 */
export async function authUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ id: string } | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ? { id: data.claims.sub } : null;
}

/**
 * A database error as a sentence a person can act on. The raw text ("duplicate
 * key value violates unique constraint ...") goes to the server log instead.
 */
export function plain(error: { message: string; code?: string }): string {
  console.error("db error", error.code, error.message);
  switch (error.code) {
    case "23505":
      return "That already exists.";
    case "23503":
      return "That's still used somewhere else.";
    case "23514":
    case "22P02":
      return "That value isn't allowed.";
    case "42501":
      return "You can't change that.";
    case "PGRST116":
      return "That no longer exists.";
    default:
      return "Something went wrong. Try again.";
  }
}
