"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { button, control } from "./ui/planner-controls";

export function AcceptInvitation() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const initialized = useRef(false);
  const version = useRef(0);
  const confirm = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const readFragment = () => {
      const incoming = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(window.history.state, "", window.location.pathname);
      version.current++;
      busy.current = false;
      setPending(false); setCreated(false); setEmail(""); setError("");
      setToken(incoming); setAttempt(value => value + 1);
    };
    if (!initialized.current) { initialized.current = true; readFragment(); }
    // Reopening an email link in this same tab may be hash-only navigation.
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch("/api/invitations/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (active) setEmail(data.email); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not check this invitation."); });
    return () => { active = false; };
  }, [token, attempt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !token) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("password") !== data.get("confirmation")) { setError("Passwords do not match."); confirm.current?.focus(); return; }
    busy.current = true; setPending(true); setError("");
    const submittedVersion = version.current;
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name: data.get("name"), password: data.get("password") }) });
      const result = await response.json();
      if (submittedVersion !== version.current) return;
      if (!response.ok) throw new Error(result.error);
      form.reset(); setToken(""); setCreated(true);
    } catch (failure) { if (submittedVersion === version.current) setError((failure instanceof Error ? failure.message : "Account creation was not confirmed.") + " If a previous attempt may have succeeded, try signing in before retrying."); }
    finally { if (submittedVersion === version.current) { busy.current = false; setPending(false); } }
  }
  if (created) return <><p role="status">Your account has been created. Sign in to open your personal workspace. Shared-workspace access is granted separately.</p><SignIn /></>;
  if (token === null) return <p role="status">Opening invitation…</p>;
  if (!token) return <><p>This invitation link is missing. Reopen the original email, or ask your administrator for another invitation.</p><SignIn /></>;
  return <>
    {email ? <form onSubmit={submit} aria-busy={pending} className="space-y-5">
      <p>Creating an account for <strong className="break-all">{email}</strong>. The invitation does not grant shared-workspace access.</p>
      <label className="block">Name<input name="name" className={control} required maxLength={100} autoComplete="name" disabled={pending} /></label>
      <label className="block">Password<input name="password" className={control} type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={pending} /></label>
      <label className="block">Confirm your password<input ref={confirm} name="confirmation" className={control} type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={pending} /></label>
      <p>Use at least 12 characters.</p>
      <button className={button} disabled={pending}>{pending ? "Creating account…" : "Create invited account"}</button>
    </form> : <><p role="status">Check your invitation to continue.</p><button className={button} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry invitation check</button></>}
    {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
    <p className="mt-5 text-sm">After reloading this page, reopen the link from your email.</p>
    <SignIn />
  </>;
}
function SignIn() { return <Link className="mt-5 inline-flex min-h-12 items-center underline" href="/sign-in">Back to sign in</Link>; }
