"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EmailOtpType } from "@supabase/supabase-js";

type Mode = "password" | "email" | "signup";
type Status = "idle" | "working" | "sent";

const fieldLabel = "text-xs font-normal text-muted-foreground";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  /** Which email is waiting to be opened, so the wait screen can name it. */
  const [sent, setSent] = useState<EmailOtpType>("email");

  // Supabase reports link failures in the fragment, which never reaches the
  // server. Read it here, then strip it so a refresh does not re-show it.
  //
  // This deliberately stays in an effect rather than moving to a render-time
  // read the way add-sheet.tsx does. That pattern works there because the value
  // comes from a prop, which exists on the server too. Here it comes from
  // `location`, and /login is prerendered -- so the build-time HTML carries no
  // error, and computing one during the first client render would disagree with
  // it and trip a hydration mismatch. One extra render on a page that renders
  // once is the cheaper of the two.
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const described = hash.get("error_description") ?? query.get("error");
    if (described) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // A full reload, not router.push(): the browser client has just written the
    // session cookie, and only a fresh document request makes the server read it
    // and render as the signed-in user. A client-side navigation would keep the
    // signed-out server state and bounce straight back off the middleware.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
    setSent("email");
    setStatus("sent");
  }

  /**
   * Creating an account was previously only a SIDE EFFECT of asking for a link
   * -- signInWithOtp creates an unknown email by default -- so the one screen
   * that had to work for somebody who has never been here said "Sign in" and
   * offered no way in. This is that way.
   */
  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setError("");

    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    if (error) return fail(error.message);

    // A session here means the project confirms addresses on sight, so there is
    // nothing to wait for. Otherwise the address has to be confirmed first.
    if (data.session) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.assign("/log");
      return;
    }
    setSent("signup");
    setStatus("sent");
  }

  const busy = status === "working";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {mode === "signup" ? "Create an account" : "Sign in"}
      </h1>

      {status === "sent" ? (
        /* The link is the whole flow. A code entry box lived here too, and the
           built-in email sender cannot carry one: customising a template needs
           custom SMTP, so the box asked for six digits nothing ever sent. */
        <div className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            {sent === "signup" ? "Confirm " : "Sent to "}
            <span className="text-foreground">{email}</span>. Open the link in that email to
            continue.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => {
              setStatus("idle");
              setError("");
            }}
          >
            Back
          </Button>
        </div>
      ) : (
        <form
          onSubmit={mode === "password" ? signInWithPassword : mode === "signup" ? signUp : sendLink}
          className="mt-4 space-y-5"
        >
          <Field>
            <FieldLabel htmlFor="email" className={fieldLabel}>
              Email
            </FieldLabel>
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
          </Field>

          {mode !== "email" && (
            <Field>
              <FieldLabel htmlFor="password" className={fieldLabel}>
                Password
              </FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                // Supabase's own floor. Stated by the browser before the
                // round trip rather than as an error after it.
                minLength={mode === "signup" ? 6 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </Field>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy
              ? "Working"
              : mode === "password"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send link"}
          </Button>

          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                setMode(mode === "email" ? "password" : "email");
                setError("");
              }}
            >
              {mode === "email" ? "Use a password instead" : "Email me a link instead"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                setMode(mode === "signup" ? "password" : "signup");
                setError("");
              }}
            >
              {mode === "signup" ? "I already have an account" : "Create an account"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
