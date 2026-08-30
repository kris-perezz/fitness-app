"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/eyebrow";

type Mode = "password" | "email";
type Status = "idle" | "working" | "sent";

const fieldLabel = "text-[10px] uppercase tracking-[0.16em] text-muted-foreground";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function fail(message: string) {
    setError(message);
    setStatus("idle");
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError("");

    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) return fail(error.message);
    location.assign("/log");
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError("");

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    if (error) return fail(error.message);
    setStatus("sent");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError("");

    const { error } = await createClient().auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      setError(error.message);
      setStatus("sent");
      return;
    }
    location.assign("/log");
  }

  const busy = status === "working";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <Eyebrow>Sign in</Eyebrow>

      {status === "sent" ? (
        <form onSubmit={verifyCode} className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Sent to <span className="text-foreground">{email}</span>. Open the link, or type the
            six-digit code from the same email.
          </p>

          <div className="space-y-2">
            <Label htmlFor="code" className={fieldLabel}>
              Code
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-14 border-0 border-b border-border px-0 text-center font-mono text-2xl tabular-nums tracking-[0.4em] shadow-none focus-visible:border-foreground focus-visible:ring-0"
              placeholder="000000"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-12 w-full text-base" disabled={code.length < 6 || busy}>
            {busy ? "Checking" : "Continue"}
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
            Back
          </Button>
        </form>
      ) : (
        <form
          onSubmit={mode === "password" ? signInWithPassword : sendLink}
          className="mt-4 space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className={fieldLabel}>
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

          {mode === "password" && (
            <div className="space-y-2">
              <Label htmlFor="password" className={fieldLabel}>
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? "Working" : mode === "password" ? "Sign in" : "Send link"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setMode(mode === "password" ? "email" : "password");
              setError("");
            }}
          >
            {mode === "password" ? "Email me a link instead" : "Use a password instead"}
          </Button>
        </form>
      )}
    </main>
  );
}
