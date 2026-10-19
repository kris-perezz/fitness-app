"use client";

// The root layout itself failed, so none of its styles or providers exist here.
export default function GlobalError({ retry }: { retry: () => void }) {
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
