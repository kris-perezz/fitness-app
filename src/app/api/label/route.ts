import { NextResponse, type NextRequest } from "next/server";
import { authUser, createClient } from "@/lib/supabase/server";
import { extractLabel } from "@/lib/label";

/** A route rather than a server action, for the same reason as /api/estimate. */
export async function POST(request: NextRequest) {
  const user = await authUser(await createClient());
  if (!user) return NextResponse.json({ status: "error", message: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  if (typeof body?.image !== "string") {
    return NextResponse.json({ status: "error", message: "No photo was sent." }, { status: 400 });
  }
  return NextResponse.json(await extractLabel(body.image, request.signal));
}
