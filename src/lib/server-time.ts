import { cookies, headers } from "next/headers";

import { isTimeZone, todayDate } from "./food.ts";
import { TIME_ZONE_COOKIE } from "./time-zone-cookie.shared.ts";

/**
 * A cookie rather than a column: the server needs the zone on the FIRST render,
 * before any query, and a preferences row cannot be read before knowing who is
 * asking. It is also not a preference -- nobody chooses it, the device knows
 * it -- so it belongs with the request rather than with the account.
 */


/**
 * The reader's IANA timezone, best available answer first.
 *
 * 1. THE COOKIE, written from `Intl` by the device itself, which is the only
 *    source that is actually authoritative about where the reader is.
 * 2. THE PROXY HEADER. Vercel resolves it from the connecting IP, so it is
 *    right often enough to be worth having and covers the first render, before
 *    any client code has run.
 * 3. NOTHING, and the caller falls back to the host clock -- correct in `next
 *    dev` on a laptop, and UTC in production, which is the case this exists to
 *    stop mattering.
 */
export async function userTimeZone(): Promise<string | undefined> {
  const fromCookie = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  if (isTimeZone(fromCookie)) return fromCookie;

  const fromProxy = (await headers()).get("x-vercel-ip-timezone");
  if (isTimeZone(fromProxy)) return fromProxy;

  return undefined;
}

/** Today for whoever is asking. Every server call site uses this, never `todayDate()`. */
export async function serverToday(): Promise<string> {
  return todayDate(new Date(), await userTimeZone());
}
