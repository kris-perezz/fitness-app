/**
 * Environment access in one place.
 *
 * `process.env.X!` hands `undefined` to whatever consumes it when the variable
 * is missing, and the failure then surfaces somewhere unrelated -- a Supabase
 * client that builds fine and 401s on first use. Reading them here fails at
 * module load with the name of the variable that is actually missing.
 *
 * The `process.env.NEXT_PUBLIC_*` references must stay literal: Next inlines
 * them at build time by textual substitution, so a computed lookup would not be
 * replaced in the browser bundle.
 */
function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
