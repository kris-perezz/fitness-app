import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const message = text(body?.message, 2000);
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  await logError("client", { message, digest: text(body?.digest, 100) }, text(body?.path, 500));
  return NextResponse.json({ ok: true });
}
