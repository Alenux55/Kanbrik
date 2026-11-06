"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { PlannerSession } from "@/lib/planner-session";
import { sessionSignalKey } from "@/lib/session-signal";

const Context = createContext<PlannerSession | null>(null);
export function PlannerSessionBoundary({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [session] = useState(() => new PlannerSession(userId, current => { window.location.replace(current ? "/projects" : "/sign-in"); }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { session.navigate(pathname); }, [pathname, session]);
  useEffect(() => {
    session.attach();
    const focus = () => { if (document.visibilityState === "visible") session.revalidate(); };
    const storage = (event: StorageEvent) => {
      if (event.key === sessionSignalKey || event.key === "better-auth.message") session.revalidate();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      session.detach();
      window.removeEventListener("storage", storage); window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus); document.removeEventListener("visibilitychange", focus);
    };
  }, [session]);
  const ready = snapshot.phase === "ready" && snapshot.path === pathname;
  return <Context.Provider value={session}>
    <div hidden={!ready} inert={!ready} data-session-state={ready ? "ready" : "checking"}>{children}</div>
    {!ready && <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{snapshot.phase === "error" ? "Could not verify your session" : "Checking your session…"}</h1>
      {snapshot.phase === "error" ? <><p role="alert" className="mt-4">Editing is paused. Your draft is kept until we can verify the account. Nothing is confirmed saved.</p><button onClick={session.revalidate} className="mt-5 min-h-12 rounded-lg border border-neutral-400 px-4">Retry session check</button></> : <p role="status" className="mt-4">Please wait while we check your account.</p>}
    </main>}
  </Context.Provider>;
}
export function usePlannerSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Protected planner requires a verified session boundary");
  return session;
}
