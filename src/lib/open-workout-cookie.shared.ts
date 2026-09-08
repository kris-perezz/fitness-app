/**
 * Just the cookie name, importable from a Client Component.
 *
 * `open-workout-cookie.ts` itself imports `next/headers`, which a Client
 * Component cannot pull in even indirectly -- Next fails the build the moment
 * a `"use client"` file's import graph reaches a server-only module. The name
 * is the only part `bottom-nav.tsx` needs, so it is the only part split out.
 */
export const OPEN_WORKOUT_COOKIE = "open_workout_id";
