import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return NextResponse.json({ ok: true });
  } catch {}
  return NextResponse.json({ ok: false }, { status: 503 });
}
