"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

type Mode = "password" | "email";
type Status = "idle" | "working" | "sent";

const fieldLabel = "text-xs font-normal text-muted-foreground";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

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
    // Same reason as signInWithPassword above: the reload is what hands the
    // freshly written session cookie to the server.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign("/log");
  }

  const busy = status === "working";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>

      {status === "sent" ? (
        <form onSubmit={verifyCode} className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Sent to <span className="text-foreground">{email}</span>. Open the link, or type the
            six-digit code from the same email.
          </p>

          <Field>
            <FieldLabel htmlFor="code" className={fieldLabel}>
              Code
            </FieldLabel>
            {/* Six slots rather than one tracked input: the digit-only filter,
                paste handling and the caret all come with the component, and a
                code typed on a phone is better shown as six things you have got
                right so far than as one string you might have fumbled. */}
            <InputOTP
              id="code"
              maxLength={6}
              // Replaces the hand-written replace(/\D/g, ""): the component
              // rejects a non-digit at the keystroke rather than after it.
              pattern={REGEXP_ONLY_DIGITS}
              value={code}
              onChange={setCode}
              containerClassName="w-full"
              autoFocus
            >
              <InputOTPGroup className="w-full gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-12 flex-1 rounded-lg border text-lg tabular-nums"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>

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

          {mode === "password" && (
            <Field>
              <FieldLabel htmlFor="password" className={fieldLabel}>
                Password
              </FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </Field>
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
