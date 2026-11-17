"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { PlannerSession } from "@/lib/planner-session";
import { sessionSignalKey } from "@/lib/session-signal";

const Context = createContext<PlannerSession | null>(null);
export function PlannerSessionBoundary({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [session] = useState(
    () =>
      new PlannerSession(userId, (current) => {
        window.location.replace(current ? "/projects" : "/sign-in");
      }),
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const protectedRoot = useRef<HTMLDivElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  const gated = useRef(false);
  useEffect(() => {
    session.navigate(pathname);
  }, [pathname, session]);
  useEffect(() => {
    session.attach();
    const focus = () => {
      if (document.visibilityState === "visible") session.revalidate();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === sessionSignalKey || event.key === "better-auth.message")
        session.revalidate();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      session.detach();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [session]);
  const ready = snapshot.phase === "ready" && snapshot.path === pathname;
  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (
        session.getSnapshot().phase === "ready" &&
        event.target instanceof HTMLElement &&
        protectedRoot.current?.contains(event.target)
      )
        focused.current = event.target;
    };
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, [session]);
  useLayoutEffect(() => {
    if (ready && gated.current && !document.querySelector("dialog[open]")) {
      const target = focused.current;
      if (
        target?.isConnected &&
        protectedRoot.current?.contains(target) &&
        !target.matches(":disabled") &&
        (!document.activeElement || document.activeElement === document.body)
      )
        target.focus({ preventScroll: true });
    }
    gated.current = !ready;
  }, [ready]);
  return (
    <Context.Provider value={session}>
      <div
        ref={protectedRoot}
        aria-hidden={!ready || undefined}
        inert={!ready}
        data-session-state={ready ? "ready" : "checking"}
      >
        {children}
      </div>
      {!ready && (
        <>
          <div aria-hidden="true" className="session-veil" />
          <section
            aria-label="Session verification"
            className="fixed top-4 right-4 left-4 z-[101] mx-auto max-w-xl rounded-lg border bg-white p-5 shadow lg:left-auto"
          >
            <h1 className="text-2xl font-semibold">
              {snapshot.phase === "error"
                ? "Could not verify your session"
                : "Checking your session…"}
            </h1>
            {snapshot.phase === "error" ? (
              <>
                <p role="alert" className="mt-4">
                  Editing is paused. Your input is kept until we can verify the
                  account. Check each change’s save status after retrying.
                </p>
                <button
                  onClick={session.revalidate}
                  className="mt-5 min-h-12 rounded-lg border border-neutral-400 px-4"
                >
                  Retry session check
                </button>
              </>
            ) : (
              <p className="mt-4">Please wait while we check your account.</p>
            )}
          </section>
        </>
      )}
    </Context.Provider>
  );
}
export function usePlannerSession() {
  const session = useContext(Context);
  if (!session)
    throw new Error("Protected planner requires a verified session boundary");
  return session;
}
