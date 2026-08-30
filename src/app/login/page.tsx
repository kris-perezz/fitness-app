"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/eyebrow";

type Status = "idle" | "sending" | "sent" | "verifying";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // Supabase reports link failures in the fragment, which never reaches the
  // server. Read it here, then strip it so a refresh does not re-show it.
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const described = hash.get("error_description") ?? query.get("error");
    if (described) {
      setError(described.replace(/\+/g, " "));
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });

    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

    if (error) {
      setError(error.message);
      setStatus("sent");
    } else {
      location.assign("/log");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <Eyebrow>Sign in</Eyebrow>

      {status === "sent" ? (
        <form onSubmit={verify} className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Sent to <span className="text-foreground">{email}</span>. Open the link, or type the
            six-digit code from the same email.
          </p>

          <div className="space-y-2">
            <Label
              htmlFor="code"
              className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              Code
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-14 border-0 border-b border-border px-0 text-center font-mono text-2xl tracking-[0.4em] tabular-nums shadow-none focus-visible:border-foreground focus-visible:ring-0"
              placeholder="000000"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={code.length < 6 || status === "verifying"}
          >
            {status === "verifying" ? "Checking" : "Continue"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setStatus("idle");
              setCode("");
              setError("");
            }}
          >
            Use a different email
          </Button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            A link and a code get emailed to you. The session then lasts months.
          </p>

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-12 w-full text-base" disabled={status === "sending"}>
            {status === "sending" ? "Sending" : "Send link"}
          </Button>
        </form>
      )}
    </main>
  );
}
