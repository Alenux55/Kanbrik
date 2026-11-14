"use client";
import { EditorNavigationLink } from "./ui/editor-dialog";
import { useEffect, useRef, useState } from "react";
import type { EntityTarget } from "./entity-editor";
import { usePlanningDrafts } from "./planning-drafts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { button } from "./ui/planner-controls";
import type { TrashImpact } from "@/lib/trash-contracts";
export const trashMoveKey = (target: EntityTarget) =>
  `${target.workspaceId}/${target.kind}/${target.record!.id}`;
export function TrashAction({
  target,
  close,
}: {
  target: EntityTarget;
  close: () => void;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const key = trashMoveKey(target),
    lock = "trash:" + key;
  const intent = store.trashMoves[key];
  const pending = store.savingKeys.includes(lock);
  const blocked = pending || store.savingKeys.includes(key);
  const path = `/api/workspaces/${target.workspaceId}/trash`;
  function discard() {
    store.setTrashMoves((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  async function preview() {
    if (blocked || busy.current || !store.beginSave(lock)) return;
    busy.current = true;
    setError("");
    try {
      const response = await session.fetch(path + "/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: target.kind === "projects" ? "project" : "task",
          id: target.record!.id,
        }),
      });
      const result = await response.json();
      if (!session.isCurrent(lease)) return;
      if (response.status === 404) {
        const access = await session.fetch(
          `/api/workspaces/${target.workspaceId}`,
        );
        if (!session.isCurrent(lease)) return;
        if (access.status === 404) {
          context.revoke(target.workspaceId);
          return;
        }
      }
      if (!response.ok) throw new Error(result.error);
      store.setTrashMoves((current) => ({
        ...current,
        [key]: {
          target,
          impact: result as TrashImpact,
          requestKey: crypto.randomUUID(),
          uncertain: false,
        },
      }));
    } catch (failure) {
      if (session.isCurrent(lease))
        setError(
          failure instanceof Error
            ? failure.message
            : "Impact could not be checked. Input is kept.",
        );
    } finally {
      busy.current = false;
      store.finishSave(lock, false);
    }
  }
  async function move() {
    if (!intent || blocked || busy.current || !store.beginSave(lock)) return;
    busy.current = true;
    setError("");
    let committed = false;
    store.setTrashMoves((current) => ({
      ...current,
      [key]: { ...intent, uncertain: true, error: undefined },
    }));
    try {
      const response = await session.fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: intent.impact.kind,
          id: intent.impact.id,
          impactDigest: intent.impact.impactDigest,
          requestKey: intent.requestKey,
        }),
      });
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (!response.ok) {
        if (response.status === 404) {
          const access = await session.fetch(
            `/api/workspaces/${target.workspaceId}`,
          );
          if (!session.isCurrent(lease)) return;
          if (access.status === 404) {
            context.revoke(target.workspaceId);
            return;
          }
        }
        store.setTrashMoves((current) => ({
          ...current,
          [key]: {
            ...intent,
            uncertain: response.status >= 500,
            error:
              result.error ??
              "Move is not confirmed. Check Trash before retrying.",
            changed: response.status === 409,
          },
        }));
        return;
      }
      store.retireWork(target.workspaceId, result.retired);
      discard();
      if (alive.current) close();
      context.refresh();
      if (alive.current)
        context.announce(
          result.batch.restoredAt
            ? "The original Trash action was already restored. Current views are refreshing."
            : "Work moved to Trash. Scheduled blocks are kept. Restore is available in workspace Trash.",
        );
    } catch {
      if (session.isCurrent(lease))
        store.setTrashMoves((current) => ({
          ...current,
          [key]: {
            ...intent,
            uncertain: true,
            error:
              "Move unconfirmed. Retry this same operation to reconcile it, or check Trash. Input is kept.",
          },
        }));
    } finally {
      busy.current = false;
      store.finishSave(lock, committed);
    }
  }
  return (
    <section
      className="mt-6 space-y-3 border-t pt-4"
      aria-label="Move work to Trash"
    >
      <h3 className="text-lg font-semibold">Move to Trash</h3>
      <p>
        Projects include their active tasks and subtasks; parent tasks include
        their active subtasks. Restore reverses the confirmed group. Scheduled
        blocks keep their intervals and references.
      </p>
      {!intent ? (
        <button
          type="button"
          className={button}
          disabled={blocked}
          onClick={() => void preview()}
        >
          Preview Move to Trash
        </button>
      ) : (
        <>
          <p className="font-semibold">
            Move “{intent.impact.title}” to Trash?
          </p>
          <p>
            {intent.impact.projectCount} projects, {intent.impact.taskCount}{" "}
            tasks, {intent.impact.subtaskCount} subtasks.{" "}
            {intent.impact.blockCount} scheduled blocks will be kept with a Work
            in Trash marker.
          </p>
          <p>
            Unsaved drafts for affected work are retired only after the move is
            confirmed. Already-trashed descendants keep their own restoration
            groups.
          </p>
          {intent.uncertain && (
            <p role="status">
              This move is unconfirmed. Retrying uses the original operation
              key. Discarding input does not undo a possible server commit.
            </p>
          )}
          {intent.error && <p role="alert">{intent.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={blocked || intent.changed}
              onClick={() => void move()}
            >
              {pending
                ? "Please wait…"
                : intent.uncertain
                  ? "Retry same Trash operation"
                  : "Confirm Move to Trash"}
            </button>
            {intent.changed && (
              <button
                type="button"
                className={button}
                disabled={blocked}
                onClick={() => void preview()}
              >
                Review updated impact
              </button>
            )}
            <button
              type="button"
              className={button}
              disabled={blocked}
              onClick={discard}
            >
              {intent.uncertain
                ? "Discard unconfirmed intent"
                : "Cancel Move to Trash"}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!blocked && (
        <EditorNavigationLink
          className="inline-flex min-h-12 items-center underline"
          href={`/trash?workspaceId=${encodeURIComponent(target.workspaceId)}`}
        >
          Open workspace Trash
        </EditorNavigationLink>
      )}
    </section>
  );
}
