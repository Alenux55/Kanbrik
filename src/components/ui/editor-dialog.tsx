"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePlannerSession } from "../planner-session";
import { button } from "./planner-controls";
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
  const [lease] = useState(session.capture);
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [confirm, setConfirm] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ dirty, pending, close, focusAfterClose });
  useEffect(() => {
    callbacks.current = { dirty, pending, close, focusAfterClose };
  }, [dirty, pending, close, focusAfterClose]);
  const source = useRef<HTMLElement | null>(null);
  const historyToken = useRef(heading);
  const downOnBackdrop = useRef(false);
  function requestClose() {
    if (pending) return;
    if (dirty) setConfirm(true);
    else close();
  }
  useEffect(() => {
    if (confirm) keep.current?.focus();
  }, [confirm]);
  useEffect(() => {
    const node = dialog.current;
    source.current = document.activeElement as HTMLElement;
    const token = historyToken.current;
    window.history.pushState(
      { ...window.history.state, kanbrikDialog: token },
      "",
      window.location.href,
    );
    const back = () => {
      const state = callbacks.current;
      if (state.pending || state.dirty) {
        window.history.pushState(
          { ...window.history.state, kanbrikDialog: token },
          "",
          window.location.href,
        );
        if (!state.pending) setConfirm(true);
      } else state.close();
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      node?.close();
      if (window.history.state?.kanbrikDialog === token) {
        const next = { ...window.history.state };
        delete next.kanbrikDialog;
        window.history.replaceState(next, "");
      }
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
          const target =
            callbacks.current.focusAfterClose?.() ?? source.current;
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
            disabled={pending}
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
            children
          )}
        </div>
        {!confirm && (
          <footer className="shrink-0 border-t p-3">
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={requestClose}
            >
              Cancel
            </button>
            {dirty && (
              <button
                type="button"
                className={button + " ml-2"}
                disabled={pending}
                onClick={close}
              >
                Keep draft for later
              </button>
            )}
          </footer>
        )}
      </div>
    </dialog>
  );
}
