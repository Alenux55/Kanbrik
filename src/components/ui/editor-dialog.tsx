"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlannerSession } from "../planner-session";
import { button } from "./planner-controls";
import { ownDialogHistory } from "@/lib/dialog-history";
const NavigationContext = createContext<{
  disabled: boolean;
  navigate: (href: string) => Promise<void>;
} | null>(null);

// An explicit preserve-and-leave action, unlike ordinary dirty close/discard.
export function EditorNavigationLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const navigation = useContext(NavigationContext);
  if (!navigation)
    throw new Error("Editor navigation requires an editor dialog");
  return (
    <Link
      href={href}
      className={className}
      aria-disabled={navigation.disabled || undefined}
      tabIndex={navigation.disabled ? -1 : undefined}
      onClick={(event) => {
        if (navigation.disabled) {
          event.preventDefault();
          return;
        }
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        void navigation.navigate(href);
      }}
    >
      {children}
    </Link>
  );
}
// Native modal supplies focus containment and inert background in Chromium/Android.
// Close it during identity verification so the session Retry screen stays operable.
export function EditorDialog({
  title,
  dirty,
  pending = false,
  discard,
  close,
  focusAfterClose,
  children,
}: {
  title: string;
  dirty: boolean;
  pending?: boolean;
  discard: () => void;
  close: () => void;
  focusAfterClose?: () => HTMLElement | null;
  children: React.ReactNode;
}) {
  const session = usePlannerSession();
  const router = useRouter();
  const [lease] = useState(session.capture);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [confirm, setConfirm] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const navigationBusy = useRef(false);
  const navigationTransferred = useRef(false);
  const alive = useRef(false);
  const history = useRef<{
    release: () => Promise<void>;
    acquire: () => void;
  } | null>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ dirty, pending, close, focusAfterClose });
  useEffect(() => {
    callbacks.current = { dirty, pending, close, focusAfterClose };
  }, [dirty, pending, close, focusAfterClose]);
  const source = useRef<HTMLElement | null>(null);
  const historyToken = useRef(heading);
  const downOnBackdrop = useRef(false);
  function requestClose() {
    if (pending || navigationBusy.current) return;
    if (dirty) setConfirm(true);
    else close();
  }
  async function navigate(href: string) {
    if (
      navigationBusy.current ||
      pending ||
      !alive.current ||
      !session.isCurrent(lease) ||
      session.getSnapshot().phase !== "ready"
    )
      return;
    navigationBusy.current = true;
    setNavigating(true);
    let released = false;
    try {
      const verified = await session.verify();
      if (
        !verified ||
        !alive.current ||
        !session.isCurrent(lease) ||
        callbacks.current.pending
      )
        return;
      await history.current?.release();
      released = true;
      if (
        !alive.current ||
        !session.isCurrent(lease) ||
        session.getSnapshot().phase !== "ready" ||
        callbacks.current.pending
      )
        return;
      navigationTransferred.current = true;
      // History removal has settled before Next can push the real destination.
      callbacks.current.close();
      router.push(href);
    } finally {
      if (alive.current && session.isCurrent(lease)) {
        if (released && !navigationTransferred.current)
          history.current?.acquire();
        navigationBusy.current = false;
        setNavigating(false);
      }
    }
  }
  useEffect(() => {
    if (confirm) keep.current?.focus();
  }, [confirm]);
  useEffect(() => {
    alive.current = true;
    const node = dialog.current;
    source.current = document.activeElement as HTMLElement;
    const acquire = () =>
      ownDialogHistory(
        historyToken.current,
        () => session.isCurrent(lease) && !session.isLeaving(),
        () => {
          const state = callbacks.current;
          if (session.getSnapshot().phase !== "ready") return true;
          if (state.pending || navigationBusy.current || state.dirty) {
            if (!state.pending && !navigationBusy.current) setConfirm(true);
            return true;
          }
          state.close();
          return false;
        },
      );
    let releaseHistory = acquire();
    history.current = {
      release: () => releaseHistory(),
      acquire: () => {
        releaseHistory = acquire();
      },
    };
    return () => {
      alive.current = false;
      void releaseHistory();
      node?.close();
      // A confirmed save can trigger a protected refetch. Wait until the
      // boundary is visible again before restoring focus, and never cross an
      // account lease while waiting.
      let done = false;
      let unsubscribe = () => {};
      const restore = () => {
        if (!session.isCurrent(lease) || session.isLeaving()) {
          done = true;
          unsubscribe();
          return;
        }
        if (session.getSnapshot().phase !== "ready") return;
        requestAnimationFrame(() => {
          if (done) return;
          if (!session.isCurrent(lease)) {
            done = true;
            unsubscribe();
            return;
          }
          if (session.getSnapshot().phase !== "ready") return;
          done = true;
          unsubscribe();
          const target = navigationTransferred.current
            ? document.getElementById("main-content")
            : (callbacks.current.focusAfterClose?.() ?? source.current);
          if (target?.isConnected && !target.closest("[hidden]"))
            target.focus();
          else document.getElementById("main-content")?.focus();
        });
      };
      unsubscribe = session.subscribe(restore);
      restore();
    };
  }, [session, lease]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (snapshot.phase === "ready") {
      if (!node.open) node.showModal();
    } else node.close();
  }, [snapshot.phase]);
  return (
    <NavigationContext.Provider
      value={{
        disabled: pending || navigating || snapshot.phase !== "ready",
        navigate,
      }}
    >
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        className="editor-dialog"
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onPointerDown={(event) => {
          downOnBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (downOnBackdrop.current && event.target === event.currentTarget)
            requestClose();
          downOnBackdrop.current = false;
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
            <h2
              id={heading}
              className="min-w-0 break-words text-xl font-semibold"
            >
              {title}
            </h2>
            <button
              type="button"
              className={button}
              disabled={pending || navigating}
              onClick={requestClose}
              aria-label="Close editor"
            >
              Close
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {confirm ? (
              <section
                aria-label="Discard unsaved changes?"
                className="space-y-4"
              >
                <h3 className="text-xl font-semibold">
                  Discard unsaved changes?
                </h3>
                <p>
                  Your input is retained while you keep editing. Discarding an
                  unconfirmed request does not undo anything the server may
                  already have saved.
                </p>
                <button
                  ref={keep}
                  type="button"
                  className={button}
                  onClick={() => setConfirm(false)}
                >
                  Keep editing
                </button>{" "}
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    discard();
                    close();
                  }}
                >
                  Discard changes
                </button>
              </section>
            ) : (
              <fieldset disabled={navigating} className="min-w-0">
                {children}
              </fieldset>
            )}
          </div>
          {!confirm && (
            <footer className="shrink-0 border-t p-3">
              <button
                type="button"
                className={button}
                disabled={pending || navigating}
                onClick={requestClose}
              >
                Cancel
              </button>
              {dirty && (
                <button
                  type="button"
                  className={button + " ml-2"}
                  disabled={pending || navigating}
                  onClick={close}
                >
                  Keep draft for later
                </button>
              )}
            </footer>
          )}
        </div>
      </dialog>
    </NavigationContext.Provider>
  );
}
