export const NO_CONNECTION = "No connection. Try again.";

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
