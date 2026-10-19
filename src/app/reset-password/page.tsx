"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Reached from the reset email, already signed in by /auth/confirm. */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setWorking(false);
      return;
    }
    // A full load, like sign-in: the server has to read the refreshed session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign("/log");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <form onSubmit={save} className="mt-4 space-y-5">
        <Field>
          <FieldLabel htmlFor="password" className="text-xs font-normal text-muted-foreground">
            New password
          </FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-base"
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={working}>
          {working ? "Saving" : "Save password"}
        </Button>
      </form>
    </main>
  );
}
