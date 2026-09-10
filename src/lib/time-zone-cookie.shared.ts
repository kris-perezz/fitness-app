/**
 * Just the cookie name, importable from a Client Component.
 *
 * `server-time.ts` imports `next/headers`, which a Client Component cannot
 * reach even indirectly -- the same split `open-workout-cookie.shared.ts`
 * exists for, and for the same build error. The writer is on the client and
 * the reader is on the server, so the name is the one thing they share.
 */
export const TIME_ZONE_COOKIE = "tz";
