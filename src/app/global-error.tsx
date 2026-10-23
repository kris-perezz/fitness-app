"use client";

import { useEffect } from "react";

// The root layout itself failed, so none of its styles or providers exist here.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1rem" }}>
        <h1 style={{ fontSize: "1.125rem" }}>Couldn&apos;t load the app</h1>
        <p style={{ color: "#666" }}>Check your connection and try again.</p>
        <button onClick={retry} style={{ marginTop: "1rem", padding: "0.6rem 1.2rem", fontSize: "1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
