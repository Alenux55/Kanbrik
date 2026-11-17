"use client";
import { OrderReviewDialog } from "./task-order-controls";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import { validZone } from "@/lib/calendar-time";
import { usePlannerSession } from "./planner-session";
import { EntityEditor, type EntityTarget } from "./entity-editor";
import { usePlanningDrafts } from "./planning-drafts";
import { control, button } from "./ui/planner-controls";
import type { Appearance } from "@/lib/settings-contracts";
export type PlannerPreferences = {
  workspaces: WorkspaceSummary[];
  defaultWorkspaceId: string;
  timeZone: string | null;
  appearance: Appearance;
};
type Value = PlannerPreferences & {
  zone: string;
  save: (input: {
    defaultWorkspaceId?: string;
    timeZone?: string;
    appearance?: Appearance;
  }) => Promise<boolean>;
  refresh: () => void;
  pending: boolean;
  error: string;
  announce: (message: string) => void;
  openEntity: (target: EntityTarget) => void;
  tagReview: { key: string; workspaceId: string } | null;
  revoke: (id: string) => void;
};
const Context = createContext<Value | null>(null);
export function PlannerContext({
  initial,
  children,
}: {
  initial: PlannerPreferences;
  children: React.ReactNode;
}) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const path = usePathname();
  const [tagReview, setTagReview] = useState<Value["tagReview"]>(null);
  const [prefs, setPrefs] = useState(initial);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.appearance = session.isCurrent(lease)
        ? prefs.appearance
        : "system";
    };
    apply();
    return session.subscribe(apply);
  }, [session, lease, prefs.appearance]);
  const [detected, setDetected] = useState("UTC");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [orderReview, setOrderReview] = useState<string | null>(null);
  const [target, setTarget] = useState<EntityTarget | null>(null);
  const {
    supplementalDrafts,
    setSupplementalDrafts,
    commentDrafts,
    setCommentDrafts,
    drafts,
    calendarDrafts,
    setDrafts,
    setCalendarDrafts,
    trashMoves,
    setTrashMoves,
    trashRestores,
    setTrashRestores,
  } = usePlanningDrafts();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (validZone(zone)) queueMicrotask(() => setDetected(zone));
  }, []);
  useEffect(() => {
    let active = true;
    const seq = ++sequence.current;
    session
      .fetch("/api/planner/preferences")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (active && seq === sequence.current && session.isCurrent(lease)) {
          setPrefs(result);
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setError(
            "Workspace/settings refresh failed. Retry before creating work.",
          );
      });
    return () => {
      active = false;
    };
  }, [session, lease, path, epoch]);
  async function save(input: {
    defaultWorkspaceId?: string;
    timeZone?: string;
    appearance?: Appearance;
  }) {
    if (busy.current) return false;
    busy.current = true;
    ++sequence.current;
    setPending(true);
    setError("");
    try {
      const response = await session.fetch("/api/planner/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!session.isCurrent(lease)) return false;
      setPrefs(result);
      return true;
    } catch {
      if (session.isCurrent(lease))
        setError("Settings not confirmed saved. Retry; your input is kept.");
      return false;
    } finally {
      if (session.isCurrent(lease)) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function revoke(id: string) {
    if (!session.isCurrent(lease)) return;
    setTagReview((current) => (current?.workspaceId === id ? null : current));
    setPrefs((current) => ({
      ...current,
      workspaces: current.workspaces.filter((w) => w.id !== id),
      defaultWorkspaceId:
        current.defaultWorkspaceId === id
          ? (current.workspaces.find((w) => w.kind === "personal")?.id ?? "")
          : current.defaultWorkspaceId,
    }));
    setSupplementalDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, draft]) => draft.workspaceId !== id),
      ),
    );
    setCommentDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(id + "/")),
      ),
    );
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(id + "/")),
      ),
    );
    setCalendarDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(id + "/")),
      ),
    );
    setTarget((current) => (current?.workspaceId === id ? null : current));
    setTrashMoves((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, intent]) => intent.target.workspaceId !== id,
        ),
      ),
    );
    setTrashRestores((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, intent]) => intent.workspaceId !== id,
        ),
      ),
    );
  }
  return (
    <Context.Provider
      value={{
        ...prefs,
        zone: prefs.timeZone ?? detected,
        save,
        refresh: () => setEpoch((x) => x + 1),
        pending,
        error,
        announce: setNotice,
        openEntity: setTarget,
        tagReview,
        revoke,
      }}
    >
      {children}
      {Object.entries(trashMoves)
        .filter(([, intent]) =>
          prefs.workspaces.some((w) => w.id === intent.target.workspaceId),
        )
        .map(([key, intent]) => (
          <p key={key} className="m-4 rounded border bg-amber-50 p-3">
            Retained Trash action for {intent.impact.title}.{" "}
            <button
              type="button"
              className={button}
              onClick={() => setTarget(intent.target)}
            >
              Review Trash action: {intent.impact.title}
            </button>
          </p>
        ))}
      {Object.entries(trashRestores)
        .filter(([, intent]) =>
          prefs.workspaces.some((w) => w.id === intent.workspaceId),
        )
        .map(([key, intent]) => (
          <p key={key} className="m-4 rounded border bg-amber-50 p-3">
            Restore is unconfirmed for {intent.batch.rootTitle}.{" "}
            <Link
              className="underline"
              href={`/trash?workspaceId=${encodeURIComponent(intent.workspaceId)}`}
            >
              Review Restore in Trash
            </Link>
          </p>
        ))}
      {notice && (
        <p
          role="status"
          className="pointer-events-none fixed right-3 bottom-3 z-40 flex max-h-[40vh] max-w-[min(30rem,90vw)] items-start gap-3 overflow-y-auto rounded border bg-teal-50 p-3 text-teal-950 shadow"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{notice}</span>
          <button
            type="button"
            className={button + " pointer-events-auto shrink-0"}
            aria-label="Dismiss save confirmation"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </p>
      )}
      {path !== "/calendar" &&
        Object.values(calendarDrafts).some((d) => d.dirty) && (
          <p className="m-4 rounded border bg-amber-50 p-3">
            Retained Calendar input is available in{" "}
            <Link className="underline" href="/calendar">
              Calendar drafts
            </Link>
            .
          </p>
        )}
      {Object.entries(drafts).some(([, draft]) => draft.dirty) && (
        <section
          aria-label="Retained work drafts"
          className="m-4 rounded border bg-amber-50 p-3"
        >
          <h2 className="font-semibold">Retained work drafts</h2>
          <p>
            Input remains in this signed-in session; it has not been confirmed
            saved.
          </p>
          {Object.entries(drafts)
            .filter(
              ([, d]) =>
                d.dirty &&
                d.target &&
                prefs.workspaces.some((w) => w.id === d.target!.workspaceId),
            )
            .map(([key, d]) => (
              <button
                key={key}
                type="button"
                className={button}
                onClick={() => setTarget(d.target!)}
              >
                Review work draft: {d.title || "Untitled"}
              </button>
            ))}
        </section>
      )}
      {Object.keys(commentDrafts).length > 0 && (
        <section
          aria-label="Retained comment drafts"
          className="m-4 rounded border bg-amber-50 p-3"
        >
          <h2 className="font-semibold">Retained comment drafts</h2>
          <p>
            Unsaved comments remain in this signed-in session. Trashed work must
            be restored before changing comments.
          </p>
          {Object.entries(commentDrafts)
            .filter(([, d]) =>
              prefs.workspaces.some((w) => w.id === d.target.workspaceId),
            )
            .map(([key, d]) => (
              <button
                key={key}
                type="button"
                className={button}
                onClick={() => setTarget(d.target)}
              >
                Review comment draft: {d.target.record!.title}
              </button>
            ))}
        </section>
      )}
      {Object.entries(supplementalDrafts).length > 0 && (
        <section
          aria-label="Retained list and configuration drafts"
          className="m-4 rounded border bg-amber-50 p-3"
        >
          <h2 className="font-semibold">
            Retained list and configuration drafts
          </h2>
          <p>
            Changes are not confirmed saved. Restore removed work before editing
            its content; workspace tag definitions remain independent.
          </p>
          {Object.entries(supplementalDrafts)
            .filter(([, d]) =>
              prefs.workspaces.some((w) => w.id === d.workspaceId),
            )
            .map(([key, d]) =>
              d.form === "tag" || d.form === "tag-remove" ? (
                <Link
                  key={key}
                  className="block min-h-11 underline"
                  href={`/settings?workspaceId=${encodeURIComponent(d.workspaceId)}&draft=${encodeURIComponent(key)}#workspace-tags`}
                  onClick={(event) => {
                    if (
                      path !== "/settings" ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    if (session.isCurrent(lease))
                      setTagReview({ key, workspaceId: d.workspaceId });
                  }}
                >
                  Review retained input: {d.label}
                </Link>
              ) : d.form === "order" ? (
                <button
                  key={key}
                  type="button"
                  className={button}
                  onClick={() => setOrderReview(key)}
                >
                  Review retained ordering: {d.label}
                </button>
              ) : d.target ? (
                <button
                  key={key}
                  className={button}
                  type="button"
                  onClick={() => setTarget(d.target!)}
                >
                  Review retained input: {d.label}
                </button>
              ) : (
                <Link
                  key={key}
                  href={`/workspaces/${d.workspaceId}`}
                  className="block underline"
                >
                  Review retained input: {d.label}
                </Link>
              ),
            )}
        </section>
      )}
      {orderReview && supplementalDrafts[orderReview] && (
        <OrderReviewDialog
          draftKey={orderReview}
          close={() => setOrderReview(null)}
        />
      )}
      {target && (
        <EntityEditor
          key={
            target.workspaceId +
            "/" +
            target.kind +
            "/" +
            (target.record?.id ??
              (target.projectId ?? "standalone") + (target.parentId ?? "root"))
          }
          target={target}
          close={() => setTarget(null)}
        />
      )}
    </Context.Provider>
  );
}
export function usePlannerContext() {
  const value = useContext(Context);
  if (!value) throw new Error("Planner context required");
  return value;
}
export function CreationWorkspace() {
  const context = usePlannerContext();
  const [input, setInput] = useState<string | null>(null);
  async function save(id: string) {
    setInput(id);
    if (await context.save({ defaultWorkspaceId: id })) setInput(null);
  }
  return (
    <div className="my-4">
      <label className="block text-sm font-semibold">
        Creation workspace
        <select
          aria-label="Creation workspace"
          className={control}
          value={input ?? context.defaultWorkspaceId}
          disabled={context.pending}
          onChange={(event) => void save(event.target.value)}
        >
          {context.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.kind})
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs">
        Projects browse this workspace. Board and Calendar keep their own
        filters.
      </p>
      {input && input !== context.defaultWorkspaceId && (
        <p role="status">
          Default workspace is not confirmed saved. Projects still uses the
          saved default.
        </p>
      )}
      {context.error && (
        <>
          <p role="alert">{context.error}</p>
          <button
            type="button"
            className={button}
            disabled={context.pending}
            onClick={() => (input ? void save(input) : context.refresh())}
          >
            Retry settings
          </button>
        </>
      )}
    </div>
  );
}
