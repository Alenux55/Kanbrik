"use client";
import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.location.replace("/sign-in"); return;
    } catch { setError("Sign-out failed. Please retry."); }
    busy.current = false; setPending(false);
  }
  return <div><button onClick={signOut} disabled={pending} className="min-h-12 rounded-lg border border-neutral-300 px-3 text-sm disabled:opacity-60">{pending ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}</div>;
}
