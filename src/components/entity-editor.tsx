"use client";
import { useEffect, useRef, useState } from "react";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import { taskStatusIds, taskStatusLabels } from "@/lib/task-statuses";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts, type PlanningDraft } from "./planning-drafts";
import { usePlannerContext } from "./planner-context";
import { EditorDialog } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";
import { matchesBoard } from "@/lib/board-filters";
import { TrashAction, trashMoveKey } from "./trash-action";
import Link from "next/link";
export type EntityTarget = {
  kind: "projects" | "tasks";
  workspaceId: string;
  record?: ProjectRecord | TaskRecord;
  projectId?: string | null;
  parentId?: string;
};
export function EntityEditor({
  target,
  close,
}: {
  target: EntityTarget;
  close: () => void;
}) {
  const { kind, workspaceId, record, parentId } = target;
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const {
    drafts,
    setDrafts,
    savingKeys,
    beginSave,
    finishSave,
    boardFilters,
    trashMoves,
    setTrashMoves,
  } = usePlanningDrafts();
  const key =
    workspaceId +
    "/" +
    kind +
    "/" +
    (record?.id ??
      "new-" + (target.projectId ?? "standalone") + "-" + (parentId ?? "root"));
  const initial: PlanningDraft = {
    title: record?.title ?? "",
    description: record?.description ?? "",
    status: record && "status" in record ? record.status : "todo",
    revision: record?.revision ?? 1,
    dirty: false,
    target,
    projectId:
      record && "projectId" in record
        ? record.projectId
        : (target.projectId ?? null),
  };
  const draft = drafts[key] ?? initial;
  const moveKey = record ? trashMoveKey(target) : "";
  const pending =
    savingKeys.includes(key) || savingKeys.includes("trash:" + moveKey);
  const [unavailable, setUnavailable] = useState(false);
  const conflict = draft.conflict;
  const [data, setData] = useState<{
    projects: ProjectRecord[];
    tasks: TaskRecord[];
  } | null>(null);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");
  const [contextRetry, setContextRetry] = useState(0);
  const alive = useRef(true);
  const filteredOut = useRef(false);
  useEffect(() => {
    let active = true;
    alive.current = true;
    Promise.all([
      session.fetch(`/api/workspaces/${workspaceId}/projects`),
      session.fetch(`/api/workspaces/${workspaceId}/tasks`),
    ])
      .then(async (responses) => {
        if (!active || !alive.current || !session.isCurrent(lease)) return;
        if (responses.some((r) => r.status === 404)) {
          const access = await session.fetch(`/api/workspaces/${workspaceId}`);
          if (!active || !alive.current || !session.isCurrent(lease)) return;
          if (access.status === 404) context.revoke(workspaceId);
          else
            setContextError(
              "Workspace context could not be checked. Your input is kept; retry editor context.",
            );
          return;
        }
        if (responses.some((r) => !r.ok)) throw new Error();
        const [projects, tasks] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (active && alive.current && session.isCurrent(lease)) {
          setData({ projects, tasks });
          setUnavailable(
            !!record &&
              !(kind === "projects" ? projects : tasks).some(
                (item: ProjectRecord) => item.id === record.id,
              ),
          );
          setContextError("");
        }
      })
      .catch(() => {
        if (active && alive.current && session.isCurrent(lease))
          setContextError(
            "Context unavailable. Input is kept; retry editor context.",
          );
      });
    return () => {
      active = false;
      alive.current = false;
    };
    // Immutable editor context; drafts and locks live above routes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, workspaceId, contextRetry]);
  function change(values: Partial<PlanningDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...draft, ...values, target, dirty: true },
    }));
  }
  function discard() {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function discardEditor() {
    discard();
    if (record)
      setTrashMoves((current) => {
        const next = { ...current };
        delete next[moveKey];
        return next;
      });
  }
  async function save() {
    if (conflict || unavailable || pending || !data || !beginSave(key)) return;
    let committed = false;
    setError("");
    change({ uncertain: !record });
    try {
      const payload = {
        title: draft.title,
        description: draft.description,
        ...(kind === "tasks" ? { status: draft.status } : {}),
        ...(record
          ? { revision: draft.revision }
          : kind === "tasks"
            ? { projectId: draft.projectId, parentId }
            : {}),
      };
      const response = await session.fetch(
        `/api/workspaces/${workspaceId}/${kind}${record ? `/${record.id}` : ""}`,
        {
          method: record ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok) {
        filteredOut.current =
          kind === "tasks" &&
          window.location.pathname === "/board" &&
          !matchesBoard(result, boardFilters, context.zone);
        discard();
        if (alive.current) close();
        context.announce(
          `Saved ${result.title}. Check the current filters if it is outside this view.`,
        );
        context.refresh();
        return;
      }
      if (!alive.current) {
        if (response.status === 409)
          change({ conflict: result.current, uncertain: false });
        return;
      }
      if (response.status === 404) {
        const access = await session.fetch(`/api/workspaces/${workspaceId}`);
        if (!alive.current || !session.isCurrent(lease)) return;
        if (access.status === 404) {
          context.revoke(workspaceId);
          return;
        }
        setError(
          access.ok
            ? "Record unavailable. Your input and unrelated drafts are retained."
            : "Save unconfirmed; workspace access could not be checked.",
        );
        if (access.ok) setUnavailable(true);
        return;
      }
      if (response.status === 409)
        change({ conflict: result.current, uncertain: false });
      else if (response.status < 500) change({ uncertain: false });
      setError(result.error ?? "Save not confirmed. Input is retained.");
    } catch {
      if (alive.current && session.isCurrent(lease))
        setError(
          "Save not confirmed. Input is kept. Check current data before retrying a new record; an earlier create may have committed.",
        );
    } finally {
      finishSave(key, committed);
    }
  }
  const entity =
    kind === "projects"
      ? "project"
      : parentId || (record && "parentId" in record && record.parentId)
        ? "subtask"
        : "task";
  const heading = (record ? "Edit " : "Create ") + entity;
  const project = data?.projects.find((p) => p.id === draft.projectId);
  const parent = data?.tasks.find(
    (t) =>
      t.id ===
      (parentId ?? (record && "parentId" in record ? record.parentId : null)),
  );
  return (
    <EditorDialog
      title={heading}
      dirty={draft.dirty || !!trashMoves[moveKey]}
      pending={pending}
      discard={discardEditor}
      close={close}
      focusAfterClose={() =>
        filteredOut.current ? document.getElementById("main-content") : null
      }
    >
      <form
        aria-label={heading}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p>
          Workspace:{" "}
          {context.workspaces.find((w) => w.id === workspaceId)?.name ??
            "Unavailable"}{" "}
          ·{" "}
          {kind === "projects"
            ? "Project"
            : (project?.title ??
              (draft.projectId ? "Project context unavailable" : "Standalone"))}
          {parent && ` · Parent: ${parent.title}`}
        </p>
        {!record && target.projectId === undefined && !parentId && (
          <label className="block">
            Destination workspace
            <select
              aria-label="Destination workspace"
              className={control}
              value={workspaceId}
              disabled={pending || draft.dirty}
              onChange={(event) =>
                context.openEntity({ kind, workspaceId: event.target.value })
              }
            >
              {context.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {record && (
          <p className="text-sm">
            Saved ownership is read-only. Revision {draft.revision}.
          </p>
        )}
        {draft.dirty && <p className="text-amber-900">Unsaved draft</p>}
        {draft.uncertain && (
          <p role="status">
            Create not yet confirmed. Check current data before retry;
            discarding input does not undo a committed request.
          </p>
        )}
        {unavailable && (
          <p role="alert">
            This work is in Trash or unavailable. Your input and unrelated
            drafts are retained.{" "}
            <Link
              className="underline"
              href={`/trash?workspaceId=${encodeURIComponent(workspaceId)}`}
            >
              Review workspace Trash
            </Link>
            .
          </p>
        )}
        <fieldset
          disabled={pending || unavailable}
          className="min-w-0 space-y-4"
        >
          <label className="block">
            Title
            <input
              autoFocus
              className={control}
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => change({ title: event.target.value })}
            />
          </label>
          <label className="block">
            Description
            <textarea
              className={control + " min-h-28"}
              maxLength={20000}
              value={draft.description}
              onChange={(event) => change({ description: event.target.value })}
            />
          </label>
          {kind === "tasks" && (
            <>
              <label className="block">
                Status
                <select
                  aria-label="Status"
                  className={control}
                  value={draft.status}
                  onChange={(event) =>
                    change({
                      status: event.target.value as PlanningDraft["status"],
                    })
                  }
                >
                  {taskStatusIds.map((status) => (
                    <option key={status} value={status}>
                      {taskStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              {!record && target.projectId === undefined && !parentId && (
                <label className="block">
                  Project
                  <select
                    aria-label="Project"
                    className={control}
                    value={draft.projectId ?? ""}
                    disabled={!data}
                    onChange={(event) =>
                      change({ projectId: event.target.value || null })
                    }
                  >
                    <option value="">Standalone</option>
                    {data?.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <button
            className={button + " bg-teal-900 text-white"}
            disabled={pending || !!conflict || !data}
          >
            {pending ? "Saving…" : record ? "Save changes" : heading}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="break-words text-red-800">
            {error}
          </p>
        )}
        {contextError && (
          <div>
            <p role="alert">{contextError}</p>
            <button
              type="button"
              className={button}
              disabled={pending}
              onClick={() => setContextRetry((value) => value + 1)}
            >
              Retry editor context
            </button>
          </div>
        )}
        {conflict && (
          <section
            aria-label="Saved version"
            className="space-y-3 border-t pt-3"
          >
            <h3>Saved version (revision {conflict.revision})</h3>
            <p>{conflict.title}</p>
            <p className="whitespace-pre-wrap break-words">
              {conflict.description}
            </p>
            {"status" in conflict && <p>{taskStatusLabels[conflict.status]}</p>}
            <button
              type="button"
              className={button}
              onClick={() => {
                discard();
                context.openEntity({ ...target, record: conflict });
              }}
            >
              Load saved version
            </button>{" "}
            <button
              type="button"
              className={button}
              onClick={() => {
                change({ revision: conflict.revision, conflict: undefined });
                setError("");
              }}
            >
              Review complete: keep my draft
            </button>
          </section>
        )}
      </form>
      {record && <TrashAction target={target} close={close} />}
    </EditorDialog>
  );
}
