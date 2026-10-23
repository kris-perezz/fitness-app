import { NextResponse, type NextRequest } from "next/server";
import { authUser, createClient } from "@/lib/supabase/server";
import { estimateFromDescription } from "@/lib/describe";

const MAX_IMAGE_CHARS = 1_200_000;
const MAX_DESCRIPTION_CHARS = 500;

/**
 * A route rather than a server action: actions run one at a time per page, so
 * a 30-second estimate held every save on the screen behind it, and a request
 * the browser aborts here actually stops instead of finishing unseen.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await authUser(supabase);
  if (!user) return NextResponse.json({ status: "error", message: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { description?: unknown; image?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description : "";
  const image = typeof body?.image === "string" ? body.image : null;

  if (description.length > MAX_DESCRIPTION_CHARS || (image !== null && image.length > MAX_IMAGE_CHARS)) {
    return NextResponse.json({ status: "error", message: "That is too large to send." }, { status: 413 });
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

  return NextResponse.json(await estimateFromDescription(description, image, request.signal));
}
