"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { announceSessionChange } from "@/lib/session-signal";

const inputClass = "mt-2 block min-h-12 w-full rounded-lg border border-neutral-400 bg-white px-3 focus-visible:outline-2 focus-visible:outline-teal-700";
const buttonClass = "min-h-12 rounded-lg bg-teal-900 px-5 py-3 text-white disabled:opacity-60";

export function ForgotPassword({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState(false);
  const busy = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const email = String(new FormData(event.currentTarget).get("email")).trim().toLowerCase();
    busy.current = true; setPending(true); setError("");
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: new URL("/reset-password", window.location.origin).href });
      if (result.error) throw new Error();
      setReceived(true);
    } catch { setError("Could not submit your reset request. Please retry or contact the administrator."); }
    finally { busy.current = false; setPending(false); }
  }
  if (!enabled) return <><p>Email password recovery is not configured yet. Contact the administrator for help.</p><BackToSignIn /></>;
  if (received) return <><p role="status">If an account matches that email, check your inbox for a password reset link. Check your spam folder too.</p><BackToSignIn /></>;
  return <><p className="mb-5 leading-7 text-neutral-600">Enter your account email to request a password reset link.</p><form onSubmit={submit} aria-busy={pending} className="space-y-5">
    <label className="block">Email<input className={inputClass} name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></label>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <button disabled={pending} className={buttonClass}>{pending ? "Sending…" : "Send reset link"}</button>
  </form><BackToSignIn /></>;
}

export function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const confirmation = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    // The email URL fragment is available only after hydration.
    setToken(incoming);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirmPassword")) { setError("Passwords do not match. Please enter them again."); confirmation.current?.focus(); return; }
    busy.current = true; setPending(true); setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: String(data.get("password")), token });
      if (result.error) throw new Error();
      form.reset(); setComplete(true); setToken("");
      announceSessionChange();
    } catch { setError("Could not reset your password. The link may be invalid or expired. Retry or request a new link."); }
    finally { busy.current = false; setPending(false); }
  }
  if (complete) return <><p role="status">Your password has been reset. Sign in with your new password. Previous sessions have been signed out.</p><BackToSignIn /></>;
  if (token === null) return <p role="status">Opening reset link…</p>;
  if (!token) return <><p>This reset link is missing or invalid.</p><Link className="inline-flex min-h-12 items-center underline" href="/forgot-password">Request a new reset link</Link></>;
  return <><p className="mb-5 text-neutral-600">Choose a new password with at least 12 characters.</p><form onSubmit={submit} aria-busy={pending} className="space-y-5">
    <label className="block">New password<input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={pending} /></label>
    <label className="block">Confirm your password<input ref={confirmation} className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={pending} /></label>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <button disabled={pending} className={buttonClass}>{pending ? "Saving…" : "Reset password"}</button>
  </form><Link href="/forgot-password" className="mt-4 inline-flex min-h-12 items-center underline">Request a new reset link</Link></>;
}

function BackToSignIn() { return <p className="mt-5"><Link href="/sign-in" className="inline-flex min-h-12 items-center underline">Back to sign in</Link></p>; }
