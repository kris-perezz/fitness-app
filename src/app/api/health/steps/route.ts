import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { dailyStepTotals } from "@/lib/steps";

/**
 * Where Apple Health steps arrive (see 0029).
 *
 * HealthKit has no web API and cannot be read while the phone is locked, so
 * nothing here can pull. What posts is Health Auto Export, running a REST
 * automation on the phone; this endpoint exists because that app sends ITS
 * payload shape rather than one this app chose.
 *
 * NO SESSION, AND NO SERVICE ROLE KEY. The caller is an app on a phone with no
 * cookie to send, so the token in the header is the identity -- and it is only
 * ever forwarded to `record_steps`, which resolves it inside the database. This
 * route can therefore run on the anon key: it holds no power the phone does not
 * already have, and a compromise of it leaks nothing that bypasses a policy.
 */
export const dynamic = "force-dynamic";

/** Chosen over `Authorization: Bearer` so nothing mistakes it for a session. */
const TOKEN_HEADER = "x-ingest-token";

export async function POST(request: NextRequest) {
  const token = request.headers.get(TOKEN_HEADER)?.trim();
  // Shape only, never validity. A missing header is a misconfigured automation
  // and saying so saves an evening; whether a well-formed token is KNOWN is the
  // database's business, and answering that here would make this an oracle for
  // guessing them.
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: `Missing or malformed ${TOKEN_HEADER}` }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body was not JSON" }, { status: 400 });
  }

  const days = dailyStepTotals(body);
  if (days.length === 0) {
    // Not an error. An automation set to a period with no steps in it posts a
    // payload with nothing to record, and it does that legitimately every run
    // that catches an empty window.
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // In sequence rather than in parallel: a run carries at most a week of days,
  // and one upsert at a time keeps a partial failure legible.
  for (const day of days) {
    const { error } = await supabase.rpc("record_steps", {
      token,
      on_date: day.date,
      steps: day.steps,
    });
    // The write itself failing IS worth reporting -- the automation retries on a
    // non-2xx, and a silent 204 over a broken database would lose the day.
    if (error) {
      return NextResponse.json({ error: "Could not record steps" }, { status: 502 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
