"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ signUp, registrationEnabled }: { signUp: boolean; registrationEnabled: boolean }) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
      const result = signUp ? await authClient.signUp.email({ ...credentials, name: String(form.get("name")) }) : await authClient.signIn.email(credentials);
      if (result.error) { setError(signUp ? "Could not create this account. Check your details or try signing in." : "Could not sign in. Check your email and password, then retry."); }
      // A full navigation discards any previous account's client router state.
      else { window.location.replace(new URL("/projects", window.location.origin).href); return; }
    } catch { setError("Could not connect. Please retry."); }
    busy.current = false; setPending(false);
  }
  if (signUp && !registrationEnabled) return <p>Registration is disabled. <Link className="underline" href="/sign-in">Sign in</Link></p>;
  const inputClass = "mt-2 block min-h-12 w-full rounded-lg border border-neutral-400 bg-white px-3 focus-visible:outline-2 focus-visible:outline-teal-700";
  return <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
    {signUp && <label className="block">Name<input className={inputClass} name="name" autoComplete="name" required maxLength={100} disabled={pending} /></label>}
    <label className="block">Email<input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></label>
    <label className="block">Password<input className={inputClass} name="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} required minLength={signUp ? 12 : undefined} maxLength={128} disabled={pending} /></label>
    {signUp && <p className="text-sm text-neutral-600">Use at least 12 characters. Registration is for local development and testing only.</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <button disabled={pending} className="min-h-12 rounded-lg bg-teal-900 px-5 py-3 text-white disabled:opacity-60">{pending ? "Please wait…" : signUp ? "Create account" : "Sign in"}</button>
    <p className="text-sm">{signUp ? <Link className="underline" href="/sign-in">Already have an account? Sign in</Link> : registrationEnabled ? <Link className="underline" href="/sign-up">Create a development account</Link> : "Registration is disabled."}</p>
  </form>;
}
