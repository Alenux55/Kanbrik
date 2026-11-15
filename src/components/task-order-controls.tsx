"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  DndContext,
  pointerWithin,
  MouseSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { TaskRecord } from "@/lib/planning-contracts";
import type { TaskOrderRecord } from "@/lib/task-order-contracts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts, type SupplementalDraft } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { EditorDialog } from "./ui/editor-dialog";
import { button } from "./ui/planner-controls";
type OrderContext = {
  scope: TaskOrderRecord;
  disabled: boolean;
  pending: boolean;
  move: (task: TaskRecord, beforeId: string | null) => void;
};
const Context = createContext<OrderContext | null>(null);
export function orderRows(rows: TaskRecord[], scope?: TaskOrderRecord) {
  if (!scope) return rows;
  const positions = new Map(scope.ids.map((id, index) => [id, index]));
  return [...rows].sort(
    (a, b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
export function SiblingOrderGroup({
  workspaceId,
  scope,
  rows,
  filtered,
  refresh,
  children,
}: {
  workspaceId: string;
  scope?: TaskOrderRecord;
  rows: TaskRecord[];
  filtered: boolean;
  refresh: () => void;
  children: React.ReactNode;
}) {
  const store = usePlanningDrafts(),
    mutations = useSupplementalMutation(refresh),
    busy = useRef(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );
  if (!scope)
    return <ul className="ml-4 space-y-1 border-l pl-3">{children}</ul>;
  const key = `${workspaceId}/order/${scope.scopeKey}`,
    draft = store.supplementalDrafts[key],
    pending = store.savingKeys.includes(
      `order:${workspaceId}/${scope.scopeKey}`,
    ),
    complete =
      scope.ids.length === rows.length &&
      rows.every((row) => scope.ids.includes(row.id)),
    disabled = filtered || !complete || !!draft;
  async function move(task: TaskRecord, beforeId: string | null) {
    if (disabled || pending || busy.current || beforeId === task.id) return;
    busy.current = true;
    const value: SupplementalDraft = {
      workspaceId,
      orderScope: scope!.scopeKey,
      form: "order",
      label: "Sibling ordering: " + task.title,
      path: `/api/workspaces/${workspaceId}/task-order`,
      method: "POST",
      values: {
        taskId: task.id,
        beforeId,
        revision: scope!.revision,
        requestKey: crypto.randomUUID(),
      },
    };
    store.setSupplementalDrafts((current) => ({ ...current, [key]: value }));
    try {
      await mutations.run(key, value);
    } finally {
      busy.current = false;
    }
  }
  return (
    <Context.Provider
      value={{
        scope,
        disabled,
        pending,
        move: (task, before) => void move(task, before),
      }}
    >
      {filtered && (
        <p className="my-2 text-sm">
          Clear task filters to reorder the complete sibling list.
        </p>
      )}
      {!filtered && !complete && (
        <p role="alert">
          Sibling order is incomplete. Refresh planning before reordering.
        </p>
      )}
      {draft && (
        <OrderingProposal
          draft={draft}
          pending={pending}
          retry={() => void mutations.run(key, draft)}
          discard={() => mutations.discard(key)}
          refresh={refresh}
        />
      )}
      <DndContext
        collisionDetection={pointerWithin}
        sensors={sensors}
        autoScroll={false}
        onDragEnd={({ active, over }) => {
          if (disabled || pending || !over || active.id === over.id) return;
          const task = rows.find((row) => row.id === active.id);
          if (task && scope.ids.includes(String(over.id)))
            void move(task, String(over.id));
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Drag only within these siblings. Move up and Move down provide keyboard and touch alternatives.",
          },
        }}
      >
        <ul
          aria-label={
            scope.scopeKey.startsWith("project/")
              ? "Project task order"
              : "Subtask order"
          }
          className="ml-4 space-y-1 border-l pl-3"
        >
          {children}
        </ul>
      </DndContext>
    </Context.Provider>
  );
}
export function SiblingOrderRow({
  task,
  children,
}: {
  task: TaskRecord;
  children: React.ReactNode;
}) {
  const group = useContext(Context),
    disabled = !group || group.disabled || group.pending;
  const {
      setNodeRef: setDragNode,
      transform,
      isDragging,
      attributes,
      listeners,
    } = useDraggable({ id: task.id, disabled }),
    { setNodeRef: setDropNode, isOver } = useDroppable({
      id: task.id,
      disabled,
    });
  const index = group?.scope.ids.indexOf(task.id) ?? -1;
  return (
    <li
      data-order-task={task.id}
      ref={setDragNode}
      className={isOver ? "rounded border border-teal-700" : ""}
      style={{
        opacity: isDragging ? 0.45 : 1,
        transform: transform
          ? `translate3d(${transform.x}px,${transform.y}px,0)`
          : undefined,
      }}
    >
      {group && (
        <div
          ref={setDropNode}
          data-order-target={task.id}
          className="flex flex-wrap items-center gap-1"
        >
          <button
            {...attributes}
            {...listeners}
            type="button"
            className={button + " hidden md:inline-flex"}
            disabled={disabled}
            aria-label={"Drag to reorder: " + task.title}
          >
            Drag
          </button>
          <button
            type="button"
            className={button}
            disabled={disabled || index <= 0}
            aria-label={"Move up: " + task.title}
            onClick={() => group.move(task, group.scope.ids[index - 1])}
          >
            Move up
          </button>
          <button
            type="button"
            className={button}
            disabled={
              disabled || index < 0 || index >= group.scope.ids.length - 1
            }
            aria-label={"Move down: " + task.title}
            onClick={() => group.move(task, group.scope.ids[index + 2] ?? null)}
          >
            Move down
          </button>
        </div>
      )}
      {children}
    </li>
  );
}
function OrderingProposal({
  draft,
  pending,
  retry,
  discard,
  refresh,
}: {
  draft: SupplementalDraft;
  pending: boolean;
  retry: () => void;
  discard: () => void;
  refresh: () => void;
}) {
  return (
    <section
      aria-label="Unconfirmed ordering"
      className="my-3 space-y-2 rounded border bg-amber-50 p-3"
    >
      <h3 className="font-semibold">Ordering is not confirmed saved</h3>
      <p>
        Saved order is shown until the server confirms the move. Work, comment
        and list input is kept.
      </p>
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <p>
          The sibling order changed. Refresh and review the current order;
          discard this proposal before choosing a new move.
        </p>
      )}
      <button
        type="button"
        className={button}
        disabled={pending || !!draft.conflict}
        onClick={retry}
      >
        Retry same ordering move
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={refresh}
      >
        Refresh sibling order
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={discard}
      >
        Discard ordering proposal
      </button>
      {draft.uncertain && (
        <p>
          A request may already have committed. Discarding input cannot undo it.
          Retrying the same move reconciles its original receipt without
          applying it over a later reorder.
        </p>
      )}
    </section>
  );
}
export function OrderReviewDialog({
  draftKey,
  close,
}: {
  draftKey: string;
  close: () => void;
}) {
  const store = usePlanningDrafts(),
    draft = store.supplementalDrafts[draftKey],
    session = usePlannerSession(),
    context = usePlannerContext(),
    [lease] = useState(session.capture),
    [data, setData] = useState<{
      scope: TaskOrderRecord;
      tasks: TaskRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const mutation = useSupplementalMutation(close);
  const workspaceId = draft?.workspaceId,
    scopeKey = draft?.orderScope;
  useEffect(() => {
    let active = true;
    if (!workspaceId || !scopeKey) return;
    Promise.all([
      session.fetch(`/api/workspaces/${workspaceId}/task-order`),
      session.fetch(`/api/workspaces/${workspaceId}/tasks`),
    ])
      .then(async (responses) => {
        if (!active || !session.isCurrent(lease)) return;
        if (responses.some((r) => r.status === 404)) {
          context.revoke(workspaceId);
          return;
        }
        if (responses.some((r) => !r.ok)) throw Error();
        const [orders, tasks] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (active && session.isCurrent(lease)) {
          const scope = orders.find(
            (s: TaskOrderRecord) => s.scopeKey === scopeKey,
          );
          if (!scope) throw Error();
          setData({ scope, tasks });
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setData(null);
          setError(
            "Order unavailable. The proposal is kept; refresh before choosing another move.",
          );
        }
      });
    return () => {
      active = false;
    };
    // The scoped account/workspace callbacks are guarded above; draft values are never rebased by a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, workspaceId, scopeKey, epoch]);
  if (!draft || !workspaceId) return null;
  const pending = store.savingKeys.includes(`order:${workspaceId}/${scopeKey}`);
  return (
    <EditorDialog
      title="Review sibling ordering"
      dirty
      pending={pending}
      discard={() => mutation.discard(draftKey)}
      close={close}
    >
      <p>{draft.label}</p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <ol className="list-inside list-decimal">
          {data.scope.ids.map((id) => (
            <li key={id}>
              {data.tasks.find((t) => t.id === id)?.title ?? "Unavailable task"}
            </li>
          ))}
        </ol>
      )}
      <OrderingProposal
        draft={draft}
        pending={pending}
        retry={() => void mutation.run(draftKey, draft)}
        discard={() => {
          mutation.discard(draftKey);
          close();
        }}
        refresh={() => setEpoch((x) => x + 1)}
      />
    </EditorDialog>
  );
}
