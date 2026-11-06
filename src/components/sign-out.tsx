"use client";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { usePlanningDrafts } from "./planning-drafts";
import { usePlannerSession } from "./planner-session";
import { expectedAccountHeader } from "@/lib/session-contract";
import { announceSessionChange } from "@/lib/session-signal";

export function SignOut() {
  const session = usePlannerSession();
  const { prepareSignOut } = usePlanningDrafts();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    const lease = session.capture();
    try {
      if (!await session.verify()) return;
      const result = await authClient.signOut({ fetchOptions: { headers: { [expectedAccountHeader]: lease.userId } } });
      if (!session.isCurrent(lease)) return;
      if (result.error?.status === 412) { session.revalidate(); return; }
      if (result.error) throw new Error();
      prepareSignOut();
      announceSessionChange(); session.invalidate(null);
    } catch { if (session.isCurrent(lease)) setError("Sign-out failed. Please retry."); }
    finally { if (session.isCurrent(lease)) { busy.current = false; setPending(false); } }
  }
  return <div><button onClick={signOut} disabled={pending} className="min-h-12 rounded-lg border border-neutral-300 px-3 text-sm disabled:opacity-60">{pending ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}</div>;
}
