import { createClient as createPlainClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Never throws: reporting an error must not become a second one. */
export async function logError(source: string, error: unknown, path?: string) {
  console.error(source, error);
  try {
    const e = error as { message?: unknown; stack?: unknown; digest?: unknown } | null;
    const message = typeof e?.message === "string" ? e.message : String(error);
    const detail = [e?.digest && `digest ${e.digest}`, typeof e?.stack === "string" && e.stack]
      .filter(Boolean)
      .join("\n");
    // Outside a request (instrumentation) there are no cookies, so fall back to anon.
    const supabase = await createClient().catch(() =>
      createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }),
    );
    await supabase.from("error_log").insert({
      source: source.slice(0, 100),
      message: message.slice(0, 2000),
      detail: detail.slice(0, 8000) || null,
      path: path?.slice(0, 500) ?? null,
    });
  } catch {}
}
