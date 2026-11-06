"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceDetail } from "@/lib/workspace-contracts";
import { usePlannerSession } from "./planner-session";

export function WorkspaceMembers({ initial }: { initial: WorkspaceDetail }) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(initial);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const path = `/api/workspaces/${encodeURIComponent(initial.id)}`;

  async function refresh() {
    const response = await session.fetch(path, { cache: "no-store" });
    if (response.status === 401 || response.status === 404) {
      setWorkspace(null);
      throw new Error("This workspace is no longer accessible. Your change is not confirmed.");
    }
    if (!response.ok) throw new Error("Could not refresh workspace access. Please retry.");
    const result = await response.json();
    if (session.isCurrent(lease)) setWorkspace(result);
  }
  async function run(action?: { suffix: string; method: "POST" | "DELETE"; body: object; leave?: boolean }) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(""); setError("");
    let saved = false;
    try {
      if (action) {
        const response = await session.fetch(path + action.suffix, { method: action.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(action.body) });
        if (!response.ok) {
          if (response.status === 401 || response.status === 404) {
            // A missing account/member is also a 404; recheck workspace access
            // before deciding whether the currently rendered roster must go.
            await refresh();
          }
          const result = await response.json();
          throw new Error(result.error ?? "Change not confirmed. Please retry.");
        }
        if (!session.isCurrent(lease)) return;
        saved = true;
        if (action.leave) { setWorkspace(null); router.replace("/workspaces"); router.refresh(); return; }
        if (action.suffix === "/members") setEmail("");
      }
      await refresh();
      if (!session.isCurrent(lease)) return;
      setMessage(saved ? "Saved. Workspace access is up to date." : "Workspace access is up to date.");
      router.refresh();
    } catch (failure) {
      if (session.isCurrent(lease)) setError(saved ? "Change saved, but details could not refresh. Use Refresh access to check again." : failure instanceof Error ? failure.message : "Change not confirmed. Please retry.");
    } finally { if (session.isCurrent(lease)) { busy.current = false; setPending(false); } }
  }

  if (!workspace) return <section><h1 className="text-3xl font-semibold">Workspace unavailable</h1><p role="alert" className="my-5">Your access may have ended, or you may need to sign in again.</p><Link href="/workspaces" className="underline">Back to your workspaces</Link></section>;
  return <section aria-busy={pending}>
    <Link href="/workspaces" className="inline-flex min-h-12 items-center text-sm underline">All workspaces</Link>
    <h1 className="mt-3 break-words text-3xl font-semibold">{workspace.name}</h1>
    <p className="mt-3 capitalize">{workspace.kind} workspace · {workspace.role}</p>
    <p className="mt-3 text-sm leading-6 text-neutral-600">This is the workspace being managed. It does not change an active planner workspace.</p>
    <button onClick={() => run()} disabled={pending} className="mt-5 min-h-12 rounded-lg border border-neutral-400 px-4 disabled:opacity-60">{pending ? "Please wait…" : "Refresh access"}</button>
    {message && <p role="status" className="mt-4 text-teal-900">{message}</p>}
    {error && <p role="alert" className="mt-4 text-red-800">{error} Your input is kept for retry.</p>}
    {workspace.kind === "personal" ? <p className="mt-8">Only you can access this personal workspace. It cannot be shared or converted.</p> : <>
      <h2 className="mt-8 text-xl font-semibold">Members</h2>
      <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white px-5">
        {workspace.members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0"><p className="break-words font-medium">{member.name}{member.isYou ? " (you)" : ""}</p><p className="break-all text-sm text-neutral-600">{member.email}</p><p className="mt-1 text-sm capitalize">{member.role}</p></div>
          {workspace.role === "owner" && member.role === "editor" && <button disabled={pending} aria-label={`Remove ${member.email}`} onClick={() => run({ suffix: `/members/${encodeURIComponent(member.id)}`, method: "DELETE", body: {} })} className="min-h-12 rounded-lg border border-neutral-400 px-4 disabled:opacity-60">Remove editor</button>}
        </li>)}
      </ul>
      {workspace.role === "owner" ? <form className="mt-8 space-y-4 rounded-xl border border-neutral-200 bg-white p-6" onSubmit={event => { event.preventDefault(); void run({ suffix: "/members", method: "POST", body: { email } }); }}>
        <h2 className="text-xl font-semibold">Add existing account</h2>
        <p className="text-sm leading-6 text-neutral-600">Access is granted immediately as editor. No invitation or email is sent. Development account emails are unverified; this does not verify anyone’s identity.</p>
        <label className="block">Account email<input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} className="mt-2 block min-h-12 w-full rounded-lg border border-neutral-400 px-3 focus-visible:outline-2 focus-visible:outline-teal-700" /></label>
        <button disabled={pending} className="min-h-12 rounded-lg bg-teal-900 px-5 py-3 text-white disabled:opacity-60">{pending ? "Saving…" : "Add existing account"}</button>
      </form> : <div className="mt-8"><p className="mb-3 text-sm text-neutral-600">Leaving ends your access to this shared workspace. Your account and personal workspace stay intact.</p><button onClick={() => run({ suffix: "/leave", method: "POST", body: {}, leave: true })} disabled={pending} className="min-h-12 rounded-lg border border-neutral-400 px-4 disabled:opacity-60">Leave workspace</button></div>}
    </>}
  </section>;
}
