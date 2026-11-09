"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts } from "./planning-drafts";
import { usePlannerContext } from "./planner-context";
import { EditorDialog } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import {
  taskStatusIds,
  taskStatusLabels,
  type TaskStatus,
} from "@/lib/task-statuses";
import {
  dateBounds,
  emptyBoardFilters,
  matchesBoard,
  projectColor,
  type BoardFilters,
} from "@/lib/board-filters";
type Preferences = { workspaces: WorkspaceSummary[]; workspaceIds: string[] };
export function Board() {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const store = usePlanningDrafts();
  const filters = store.boardFilters;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  const [panel, setPanel] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [draftFilters, setDraftFilters] = useState<BoardFilters>(filters);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [pickerError, setPickerError] = useState(false);
  useEffect(() => {
    let active = true;
    session
      .fetch("/api/board/preferences")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (active && session.isCurrent(lease)) {
          setPrefs(data);
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setError("Could not load board selection. Refresh board to retry.");
      });
    return () => {
      active = false;
    };
  }, [session, lease, epoch]);
  useEffect(() => {
    let active = true;
    Promise.all(
      context.workspaces.map(async (w) => {
        const r = await session.fetch(`/api/workspaces/${w.id}/projects`);
        if (!r.ok) throw new Error();
        return (await r.json()) as ProjectRecord[];
      }),
    )
      .then((rows) => {
        if (active && session.isCurrent(lease)) {
          setProjects(rows.flat());
          setPickerError(false);
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) setPickerError(true);
      });
    return () => {
      active = false;
    };
  }, [session, lease, context.workspaces, store.saveEpoch, epoch]);
  async function apply(ids = draftIds, applied = draftFilters) {
    if (busy.current || !prefs) return;
    busy.current = true;
    setPending(true);
    setError("");
    const allowedProjects = applied.projects.filter(
      (id) =>
        id === "standalone" ||
        projects.some((p) => p.id === id && ids.includes(p.workspaceId)),
    );
    try {
      const r = await session.fetch("/api/board/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceIds: ids }),
      });
      if (!r.ok) throw new Error();
      const result = await r.json();
      if (session.isCurrent(lease)) {
        setPrefs(
          (current) =>
            current && { ...current, workspaceIds: result.workspaceIds },
        );
        store.setBoardFilters({ ...applied, projects: allowedProjects });
        setPanel(false);
      }
    } catch {
      if (session.isCurrent(lease))
        setError("Filters not confirmed saved. Input is kept; retry.");
    } finally {
      if (session.isCurrent(lease)) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function revoked(id: string) {
    context.revoke(id);
    setPrefs(
      (current) =>
        current && {
          workspaces: current.workspaces.filter((w) => w.id !== id),
          workspaceIds: current.workspaceIds.filter((value) => value !== id),
        },
    );
    setError("Workspace access ended. Its cards and drafts were removed.");
  }
  const count =
    filters.projects.length +
    [
      filters.createdFrom,
      filters.createdTo,
      filters.editedFrom,
      filters.editedTo,
      filters.search,
    ].filter(Boolean).length +
    Number(filters.hideDone);
  return (
    <section className="min-w-0">
      <h1 className="text-4xl font-semibold">Board</h1>
      <p className="mt-3">
        Canonical tasks, five statuses. Click a card to edit; desktop dragging
        changes status.
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() =>
            context.openEntity({
              kind: "tasks",
              workspaceId: context.defaultWorkspaceId,
            })
          }
        >
          New task
        </button>
        <button
          className={button}
          disabled={!prefs}
          onClick={() => {
            setDraftIds(prefs!.workspaceIds);
            setDraftFilters(filters);
            setPanel(true);
          }}
        >
          Filters ({count})
        </button>
        <button
          className={button}
          onClick={() => {
            setPrefs(null);
            setEpoch((x) => x + 1);
          }}
        >
          Refresh board
        </button>
        <button
          className={button}
          disabled={!prefs || pending}
          onClick={() => void apply(prefs!.workspaceIds, emptyBoardFilters)}
        >
          Clear filters
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!prefs ? (
        <p role="status">Loading board…</p>
      ) : (
        <>
          <p className="my-3 break-words text-sm">
            Active workspaces ({prefs.workspaceIds.length}):{" "}
            {prefs.workspaces
              .filter((w) => prefs.workspaceIds.includes(w.id))
              .map((w) => w.name)
              .join(", ") || "None"}
            . {count} task filters. Dates use {context.zone}.
          </p>
          {!prefs.workspaceIds.includes(context.defaultWorkspaceId) && (
            <p className="my-3 rounded border p-3">
              Creation workspace is outside this Board selection.{" "}
              <button
                className={button}
                onClick={() =>
                  void apply(
                    [...prefs.workspaceIds, context.defaultWorkspaceId],
                    filters,
                  )
                }
              >
                Show creation workspace
              </button>
            </p>
          )}
          {prefs.workspaceIds.length ? (
            <SelectedBoard
              key={`${epoch}:${prefs.workspaceIds.join(",")}`}
              workspaces={prefs.workspaces.filter((w) =>
                prefs.workspaceIds.includes(w.id),
              )}
              filters={filters}
              paused={panel}
              onRevoked={revoked}
            />
          ) : (
            <p>
              No workspaces selected. Open Filters to choose visible workspaces.
            </p>
          )}
        </>
      )}
      {panel && prefs && (
        <EditorDialog
          title="Board filters"
          dirty={false}
          pending={pending}
          close={() => setPanel(false)}
          discard={() => {}}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void apply();
            }}
          >
            <fieldset disabled={pending} className="space-y-4">
              <legend>Visible workspaces</legend>
              {prefs.workspaces.map((w) => (
                <label key={w.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draftIds.includes(w.id)}
                    onChange={(e) =>
                      setDraftIds((current) =>
                        e.target.checked
                          ? [...current, w.id]
                          : current.filter((id) => id !== w.id),
                      )
                    }
                  />
                  {w.name} ({w.kind})
                </label>
              ))}
              <fieldset>
                <legend>Projects (none means all)</legend>
                {[
                  { id: "standalone", title: "Standalone" },
                  ...projects.filter((p) => draftIds.includes(p.workspaceId)),
                ].map((p) => (
                  <label
                    key={p.id}
                    className="flex min-h-11 items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={draftFilters.projects.includes(p.id)}
                      onChange={(e) =>
                        setDraftFilters((current) => ({
                          ...current,
                          projects: e.target.checked
                            ? [...current.projects, p.id]
                            : current.projects.filter((id) => id !== p.id),
                        }))
                      }
                    />
                    {p.title}
                  </label>
                ))}
                {pickerError && (
                  <p role="alert">
                    Project picker incomplete. Refresh board to retry; existing
                    project filters are retained.
                  </p>
                )}
              </fieldset>
              <label className="block">
                Title search
                <input
                  className={control}
                  value={draftFilters.search}
                  onChange={(e) =>
                    setDraftFilters((f) => ({ ...f, search: e.target.value }))
                  }
                />
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draftFilters.hideDone}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      hideDone: e.target.checked,
                    }))
                  }
                />
                Hide Done
              </label>
              {(
                [
                  ["createdFrom", "Created from"],
                  ["createdTo", "Created through"],
                  ["editedFrom", "Edited from"],
                  ["editedTo", "Edited through"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  {label}
                  <input
                    type="date"
                    className={control}
                    value={draftFilters[key]}
                    onChange={(e) =>
                      setDraftFilters((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <p className="text-sm">
                Through dates include that entire local day. Last edited
                includes status moves.
              </p>
              <button
                className={button}
                disabled={
                  pending ||
                  (pickerError && !!draftFilters.projects.length) ||
                  !dateBounds(
                    draftFilters.createdFrom,
                    draftFilters.createdTo,
                    context.zone,
                  ) ||
                  !dateBounds(
                    draftFilters.editedFrom,
                    draftFilters.editedTo,
                    context.zone,
                  )
                }
              >
                Apply filters
              </button>
            </fieldset>
          </form>
        </EditorDialog>
      )}
    </section>
  );
}
type Scope = {
  workspace: WorkspaceSummary;
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  failed: boolean;
};
function SelectedBoard({
  workspaces,
  filters,
  paused,
  onRevoked,
}: {
  workspaces: WorkspaceSummary[];
  filters: BoardFilters;
  paused: boolean;
  onRevoked: (id: string) => void;
}) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const store = usePlanningDrafts();
  const [scopes, setScopes] = useState<Scope[] | null>(null);
  const [message, setMessage] = useState("");
  const [activeStatus, setActiveStatus] = useState<TaskStatus>("todo");
  const [dragged, setDragged] = useState<TaskRecord | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const suppressClick = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );
  useEffect(() => {
    alive.current = true;
    const seq = ++generation.current;
    Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const responses = await Promise.all([
            session.fetch(`/api/workspaces/${workspace.id}/tasks`),
            session.fetch(`/api/workspaces/${workspace.id}/projects`),
          ]);
          if (responses.some((r) => r.status === 404)) {
            if (
              alive.current &&
              seq === generation.current &&
              session.isCurrent(lease)
            )
              onRevoked(workspace.id);
            return null;
          }
          if (responses.some((r) => !r.ok)) throw new Error();
          return {
            workspace,
            tasks: (await responses[0].json()) as TaskRecord[],
            projects: (await responses[1].json()) as ProjectRecord[],
            failed: false,
          };
        } catch {
          return { workspace, tasks: [], projects: [], failed: true };
        }
      }),
    ).then((result) => {
      if (
        alive.current &&
        seq === generation.current &&
        session.isCurrent(lease)
      )
        setScopes(result.filter((x): x is Scope => x !== null));
    });
    return () => {
      alive.current = false;
    };
    // Selection is immutable; changing it cancels the mounted gesture context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, store.saveEpoch]);
  async function move(task: TaskRecord, status: TaskStatus) {
    if (!alive.current || !session.isCurrent(lease) || task.status === status)
      return;
    const key = `${task.workspaceId}/tasks/${task.id}`;
    if (store.drafts[key]?.dirty) {
      setMessage("Review the retained draft before moving this task.");
      return;
    }
    if (!store.beginSave(key)) return;
    let committed = false;
    const target = {
      kind: "tasks" as const,
      workspaceId: task.workspaceId,
      record: task,
    };
    const proposed = {
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status,
      revision: task.revision,
      dirty: true,
      target,
    };
    store.setDrafts((current) => ({ ...current, [key]: proposed }));
    try {
      const r = await session.fetch(
        `/api/workspaces/${task.workspaceId}/tasks/${task.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, revision: task.revision }),
        },
      );
      const result = await r.json();
      committed = r.ok;
      if (!session.isCurrent(lease)) return;
      if (r.ok)
        store.setDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      else if (r.status === 409)
        store.setDrafts((current) => ({
          ...current,
          [key]: { ...proposed, conflict: result.current },
        }));
      if (!alive.current) return;
      if (r.status === 404) {
        const access = await session.fetch(
          `/api/workspaces/${task.workspaceId}`,
        );
        if (!alive.current || !session.isCurrent(lease)) return;
        if (access.status === 404) {
          onRevoked(task.workspaceId);
          return;
        }
        setMessage(
          "Task unavailable or save unconfirmed. Retained input is available for review.",
        );
        return;
      }
      if (!r.ok) {
        setMessage(
          r.status === 409
            ? "Move conflicted. Review the retained draft before another explicit save."
            : "Move not confirmed. Proposed input retained; review and retry explicitly.",
        );
        return;
      }
      setActiveStatus(status);
      setScopes(
        (current) =>
          current?.map((scope) => ({
            ...scope,
            tasks: scope.tasks.map((t) => (t.id === task.id ? result : t)),
          })) ?? null,
      );
      setMessage(
        `Saved ${task.title}: ${taskStatusLabels[status]}. It may be outside the current filters.`,
      );
      document.getElementById("main-content")?.focus();
    } catch {
      if (alive.current && session.isCurrent(lease))
        setMessage(
          "Move not confirmed. Proposed input retained; review and retry explicitly.",
        );
    } finally {
      store.finishSave(key, committed);
    }
  }
  if (!scopes) return <p role="status">Loading tasks…</p>;
  const all = scopes
    .flatMap((s) => s.tasks)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const tasks = all.filter((t) => matchesBoard(t, filters, context.zone));
  const incomplete = scopes.some((s) => s.failed);
  function end() {
    setDragged(null);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 100);
  }
  return (
    <div className="mt-5 min-w-0">
      {incomplete && (
        <p role="alert">
          Board incomplete. Failed workspaces have no editable stale cards;
          counts cover loaded scopes only. Refresh board to retry.
        </p>
      )}
      <p className="mb-3">
        Matching tasks: {tasks.length} of {all.length}{" "}
        {incomplete ? "loaded" : "total"}. Creation order; no manual ordering.
      </p>
      <p role="status" className="my-3 break-words text-teal-900">
        {message}
      </p>
      {!tasks.length && <p className="my-4">No tasks match these filters.</p>}
      <div
        className="mb-3 flex flex-wrap gap-2 lg:hidden"
        aria-label="Status columns"
      >
        {taskStatusIds.map((s) => (
          <button
            key={s}
            className={button}
            aria-pressed={s === activeStatus}
            onClick={() => setActiveStatus(s)}
          >
            {taskStatusLabels[s]} ({tasks.filter((t) => t.status === s).length})
          </button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        autoScroll={false}
        onDragStart={({ active }) => {
          suppressClick.current = true;
          setDragged(tasks.find((t) => t.id === active.id) ?? null);
        }}
        onDragCancel={end}
        onDragEnd={({ active, over }) => {
          end();
          if (
            paused ||
            session.getSnapshot().phase !== "ready" ||
            document.querySelector("dialog[open]")
          )
            return;
          const task = tasks.find((t) => t.id === active.id);
          if (task && over && taskStatusIds.includes(over.id as TaskStatus))
            void move(task, over.id as TaskStatus);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Open a task to change its status with keyboard or touch. Mouse users can drag the card.",
          },
        }}
      >
        <div className="grid min-w-0 gap-3 lg:grid-cols-5">
          {taskStatusIds.map((status) => (
            <Column
              key={status}
              status={status}
              active={status === activeStatus}
              count={tasks.filter((t) => t.status === status).length}
            >
              {tasks
                .filter((t) => t.status === status)
                .map((task) => {
                  const scope = scopes.find(
                    (s) => s.workspace.id === task.workspaceId,
                  )!;
                  return (
                    <Card
                      key={task.id}
                      task={task}
                      workspace={
                        workspaces.length > 1 ? scope.workspace.name : undefined
                      }
                      project={
                        scope.projects.find((p) => p.id === task.projectId)
                          ?.title ?? "Standalone"
                      }
                      parent={
                        scope.tasks.find((t) => t.id === task.parentId)?.title
                      }
                      pending={store.savingKeys.includes(
                        `${task.workspaceId}/tasks/${task.id}`,
                      )}
                      dirty={
                        !!store.drafts[`${task.workspaceId}/tasks/${task.id}`]
                          ?.dirty
                      }
                      open={() => {
                        if (!suppressClick.current)
                          context.openEntity({
                            kind: "tasks",
                            workspaceId: task.workspaceId,
                            record: task,
                          });
                      }}
                    />
                  );
                })}
            </Column>
          ))}
        </div>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragged && (
              <div
                data-drag-preview
                className="max-w-[min(16rem,80vw)] rounded border p-3 shadow-lg [overflow-wrap:anywhere]"
                style={{ background: projectColor(dragged.projectId) }}
              >
                {dragged.title}
              </div>
            )}
          </DragOverlay>,
          document.querySelector<HTMLElement>("[data-session-state]")!,
        )}
      </DndContext>
    </div>
  );
}
function Column({
  status,
  active,
  count,
  children,
}: {
  status: TaskStatus;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${taskStatusLabels[status]} column`}
      className={`${active ? "block" : "hidden lg:block"} min-h-40 min-w-0 rounded-xl border p-2 ${isOver ? "border-teal-800 bg-teal-50" : "border-neutral-300 bg-neutral-100"}`}
    >
      <h2 className="mb-3 break-words font-semibold">
        {taskStatusLabels[status]} ({count})
      </h2>
      {children}
    </section>
  );
}
function Card({
  task,
  workspace,
  project,
  parent,
  pending,
  dirty,
  open,
}: {
  task: TaskRecord;
  workspace?: string;
  project: string;
  parent?: string;
  pending: boolean;
  dirty: boolean;
  open: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: task.id,
    disabled: pending || dirty,
  });
  return (
    <article aria-label={task.title} className="mb-2 min-w-0">
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-disabled={pending}
        onClick={open}
        disabled={pending}
        className="block min-h-14 w-full min-w-0 rounded-lg border border-neutral-300 p-3 text-left text-neutral-950 shadow-sm"
        style={{
          background: projectColor(task.projectId),
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        <span className="block break-words font-semibold">{task.title}</span>
        <span className="mt-1 block break-words text-xs">
          {project}
          {workspace && ` · ${workspace}`}
          {parent && ` · Subtask of ${parent}`}
        </span>
        {pending && <span role="status">Saving move…</span>}
        {dirty && (
          <span className="block text-xs text-amber-950">
            Retained unsaved draft — open to review
          </span>
        )}
      </button>
    </article>
  );
}
