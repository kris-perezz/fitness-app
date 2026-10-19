"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * State mirrored into the address, so the day or month you paged to is still
 * there after visiting another screen and coming back. Replaced, not pushed:
 * paging is not a place the back button should step through. The fallback is
 * left out of the address, so today stays a clean URL.
 */
export function useUrlParam(key: string, fallback: string, valid: (value: string) => boolean) {
  const param = useSearchParams().get(key);
  const [value, setValue] = useState(param !== null && valid(param) ? param : fallback);

  function set(next: string) {
    setValue(next);
    const url = new URL(window.location.href);
    if (next === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, next);
    window.history.replaceState(null, "", url);
  }

  return [value, set] as const;
}

export const isDay = (today: string) => (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && v <= today;
export const isMonth = (today: string) => (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v <= today.slice(0, 7);
