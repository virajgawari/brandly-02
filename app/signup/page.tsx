"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import AuthCard, { authMessage, nextPath } from "@/components/auth/AuthCard";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [trainingOptIn, setTrainingOptIn] = useState(false);
  const [qs, setQs] = useState(""); // keeps ?next= when switching between sign in and sign up
  useEffect(() => setQs(window.location.search), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e: React.FormEvent) => {
    // An invite link sends people here with ?next=/invite/<token>; go back to it instead of onboarding.
    const after = nextPath() === "/" ? "/onboarding" : nextPath();
    e.preventDefault();
    if (password.length < 8) return setError("Choose a password with at least 8 characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(after)}`,
        // Read by the on_auth_user_created trigger (profile + workspace + consent).
        data: { full_name: name.trim(), terms_accepted: terms, training_opt_in: trainingOptIn, signup_source: "web" },
      },
    });
    setBusy(false);
    if (error) return setError(authMessage(error));
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && !data.user.identities?.length) return setError("There's already an account with this email. Sign in instead.");
    if (data.session) {
      window.location.href = after;
      return;
    }
    setCheckEmail(true);
  };

  if (checkEmail) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a confirmation link to ${email}.`}>
        <p className="text-sm text-text-muted">Open the link to finish creating your account. You can close this tab.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up your brand and start making posts."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login${qs}`} className="text-text underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={trainingOptIn} onChange={(e) => setTrainingOptIn(e.target.checked)} />
          <span>
            Help improve Brandly
            <span className="block text-xs text-text-muted">Allow your edits and ratings to be used to improve the AI. You can change this any time.</span>
          </span>
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={!terms}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
