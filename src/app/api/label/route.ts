import { NextResponse, type NextRequest } from "next/server";
import { authUser, createClient } from "@/lib/supabase/server";
import { extractLabel } from "@/lib/label";

const MAX_IMAGE_CHARS = 1_200_000;

/** A route rather than a server action, for the same reason as /api/estimate. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUser(supabase);
  if (!user) return NextResponse.json({ status: "error", message: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  if (typeof body?.image !== "string") {
    return NextResponse.json({ status: "error", message: "No photo was sent." }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ status: "error", message: "That photo is too large." }, { status: 413 });
  }

  const { data: allowed, error } = await supabase.rpc("take_ai_call");
  // Fails open so the feature works before the 0039 migration has been run.
  if (error) console.error("take_ai_call failed", error.message);
  else if (allowed === false) {
    return NextResponse.json(
      { status: "error", message: "Daily AI limit reached. Try again tomorrow." },
      { status: 429 },
    );
  }

  return NextResponse.json(await extractLabel(body.image, request.signal));
}
