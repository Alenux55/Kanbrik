"use client";
import { useEffect, useRef, useState } from "react";
import { usePlannerSession } from "./planner-session";
import { button, control } from "./ui/planner-controls";

type Invitation = { id: string; email: string; expiresAt: string; consumedAt: string | null };
export function AccountInvitations() {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const [rows, setRows] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [configured, setConfigured] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const listVersion = useRef(0);
  async function load() {
    const version = ++listVersion.current;
    const response = await session.fetch("/api/invitations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (session.isCurrent(lease) && version === listVersion.current) { setRows(data.invitations); setConfigured(data.emailConfigured); }
  }
  useEffect(() => {
    const version = ++listVersion.current;
    let active = true;
    session.fetch("/api/invitations", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error();
      if (active && session.isCurrent(lease) && version === listVersion.current) { setRows(data.invitations); setConfigured(data.emailConfigured); }
    }).catch(() => { if (active && session.isCurrent(lease) && version === listVersion.current) setError("Could not load invitations. Use Refresh invitations to retry."); });
    return () => { active = false; };
  }, [session, lease]);
  async function run(action?: { id?: string; email?: string }) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(""); setNotice("");
    let saved = false;
    try {
      if (action) {
        const response = await session.fetch(action.id ? `/api/invitations/${encodeURIComponent(action.id)}` : "/api/invitations", {
          method: action.id ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.id ? {} : { email: action.email }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!session.isCurrent(lease)) return;
        saved = true;
        if (!action.id) setEmail("");
        setNotice(action.id ? "Invitation revoked." : "Invitation sent. The link expires in seven days. Shared access is granted separately.");
      }
      await load();
    } catch (failure) {
      if (session.isCurrent(lease)) setError(saved ? "Change saved, but the list could not refresh. Refresh invitations to check." : failure instanceof Error ? failure.message : "Change not confirmed. Refresh before retrying.");
    } finally { if (session.isCurrent(lease)) { busy.current = false; setPending(false); } }
  }
  return <section aria-labelledby="account-invitations-heading" aria-busy={pending} className="mt-10 max-w-2xl border-t pt-6">
    <h2 id="account-invitations-heading" className="text-2xl font-semibold">Account invitations</h2>
    <p className="my-4">Invite a specific email address to create an account. This gives them a private personal workspace. Add them to a shared workspace separately.</p>
    {!configured && <p role="alert">Configure SMTP on the server before sending invitations.</p>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run({ email }); }}>
      <label className="block">Invitation email<input className={control} type="email" maxLength={254} required disabled={pending} value={email} onChange={event => setEmail(event.target.value)} autoComplete="off" /></label>
      <button className={button} disabled={pending || !configured}>Send account invitation</button>
    </form>
    <button className={button + " mt-4"} disabled={pending} onClick={() => void run()}>Refresh invitations</button>
    {notice && <p role="status" className="my-4">{notice}</p>}
    {error && <p role="alert" className="my-4 text-red-800">{error} Your input is kept.</p>}
    <ul className="mt-4 divide-y">
      {rows.map(row => <li key={row.id} className="space-y-2 py-4">
        <p className="break-all font-medium">{row.email}</p>
        <p>{row.consumedAt ? "Accepted" : "Expires " + row.expiresAt.slice(0, 10) + " (UTC)"}</p>
        {!row.consumedAt && <div className="flex flex-wrap gap-2">
          <button className={button} disabled={pending || !configured} aria-label={`Resend invitation to ${row.email}`} onClick={() => void run({ email: row.email })}>Resend</button>
          <button className={button} disabled={pending} aria-label={`Revoke invitation to ${row.email}`} onClick={() => void run({ id: row.id })}>Revoke</button>
        </div>}
      </li>)}
    </ul>
    <p className="mt-3 text-sm">Resending replaces the previous link. Wait one minute between sends to the same address. Only the latest 100 invitations are shown. Revoking an invitation does not delete an account that has already been created.</p>
  </section>;
}
