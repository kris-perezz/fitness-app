/**
 * A same-site path to go to after signing in, or the default. Anything else --
 * another origin, a protocol-relative "//host" -- would make the login page an
 * open redirect.
 */
export function safeNext(next: string | null | undefined, fallback = "/log"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
