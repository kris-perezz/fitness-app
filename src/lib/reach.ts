const NO_CONNECTION = "No connection. Try again.";

/**
 * A server action that throws never reached the server, or never came back.
 * Reported as a failed result, the same shape every action already returns,
 * so the caller's error path keeps the form open instead of the screen going
 * to the error boundary with what was typed.
 */
export function reach<T>(call: Promise<T>): Promise<T> {
  return call.catch((error: unknown) => {
    console.error(error);
    return { error: NO_CONNECTION, source: "error" } as T;
  });
}

/**
 * POST JSON to one of this app's own routes. A dropped connection comes back
 * as an error result, like `reach`; an abort the caller asked for comes back
 * as null, which the caller ignores.
 */
export async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return (await res.json()) as T;
  } catch (error) {
    if (signal?.aborted) return null;
    console.error(error);
    return { status: "error", message: NO_CONNECTION } as T;
  }
}
