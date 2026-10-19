import { NextResponse, type NextRequest } from "next/server";
import { authUser, createClient } from "@/lib/supabase/server";
import { estimateFromDescription } from "@/lib/describe";

/**
 * A route rather than a server action: actions run one at a time per page, so
 * a 30-second estimate held every save on the screen behind it, and a request
 * the browser aborts here actually stops instead of finishing unseen.
 */
export async function POST(request: NextRequest) {
  const user = await authUser(await createClient());
  if (!user) return NextResponse.json({ status: "error", message: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { description?: unknown; image?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description : "";
  const image = typeof body?.image === "string" ? body.image : null;

  return NextResponse.json(await estimateFromDescription(description, image, request.signal));
}
