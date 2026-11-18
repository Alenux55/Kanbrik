"use client";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import type { TaskRecord } from "@/lib/planning-contracts";
import type { TaskOrderRecord } from "@/lib/task-order-contracts";
import { insertSibling, siblingInsertion } from "@/lib/sibling-preview";
import { usePlanningDrafts, type SupplementalDraft } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { usePlannerDrag } from "./use-planner-drag";
import { OrderingProposal } from "./order-proposal";
import { button } from "./ui/planner-controls";

type OrderContext = {
  scope: TaskOrderRecord;
  layoutKey: string;
  previewing: boolean;
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
  const key = scope ? `${workspaceId}/order/${scope.scopeKey}` : "";
  const draft = store.supplementalDrafts[key];
  const pending =
    !!scope &&
    store.savingKeys.includes(`order:${workspaceId}/${scope.scopeKey}`);
  const complete =
    !!scope &&
    scope.ids.length === rows.length &&
    rows.every((row) => scope.ids.includes(row.id));
  const disabled = !scope || filtered || !complete || !!draft;
  const { sensors, guard } = usePlannerDrag(
    [scope, filtered, pending, disabled, store.expansion],
    !disabled && !pending,
    "projects",
  );
  const list = useRef<HTMLUListElement>(null),
    frame = useRef(0);
  const updatePlacement = useRef<() => void>(() => {});
  const intent = useRef<{
    task: TaskRecord;
    ids: string[];
    index: number;
    valid: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<{
    task: TaskRecord;
    height: number;
  } | null>(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function end() {
    cancelAnimationFrame(frame.current);
    intent.current = null;
    setPreview(null);
    setLifted(null);
  }
  async function move(task: TaskRecord, beforeId: string | null) {
    if (!scope || disabled || pending || busy.current || beforeId === task.id)
      return;
    busy.current = true;
    const value: SupplementalDraft = {
      workspaceId,
      orderScope: scope.scopeKey,
      form: "order",
      label: "Sibling ordering: " + task.title,
      path: `/api/workspaces/${workspaceId}/task-order`,
      method: "POST",
      values: {
        taskId: task.id,
        beforeId,
        revision: scope.revision,
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
  if (!scope)
    return <ul className="ml-4 space-y-1 border-l pl-3">{children}</ul>;
  const originals = Children.toArray(children);
  const byId = new Map(
    originals
      .filter(isValidElement<{ task: TaskRecord }>)
      .map((child) => [child.props.task?.id, child]),
  );
  const rendered = preview ? preview.map((id) => byId.get(id)) : originals;
  return (
    <Context.Provider
      value={{
        scope,
        layoutKey: (preview ?? scope.ids).join("|"),
        previewing: preview !== null,
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
        sensors={sensors}
        autoScroll={false}
        onDragStart={({ active }) => {
          const task = rows.find((row) => row.id === active.id),
            root = list.current,
            point = guard.start;
          if (!task || !root || !point || !guard.ready()) {
            guard.cancel?.();
            return;
          }
          const rects = [
            ...root.querySelectorAll<HTMLElement>(":scope > [data-order-task]"),
          ].map((node) => ({
            id: node.dataset.orderTask!,
            rect: node.getBoundingClientRect(),
          }));
          const source = rects.find((row) => row.id === task.id);
          if (!source || rects.length !== scope.ids.length) {
            guard.cancel?.();
            return;
          }
          const others = rects.filter((row) => row.id !== task.id);
          const center = (id: string) => {
            const header = root
              .querySelector<HTMLElement>(`[data-order-target="${id}"]`)!
              .getBoundingClientRect();
            return header.top + header.height / 2 + window.scrollY;
          };
          const centers = others.map((row) => center(row.id));
          const initialPointer = point.y + window.scrollY;
          const sourceCenter = center(source.id);
          const proposal = {
            task,
            ids: [...scope.ids],
            index: scope.ids.indexOf(task.id),
            valid: true,
          };
          intent.current = proposal;
          setLifted({ task, height: source.rect.height });
          setPreview([...scope.ids]);
          const update = () => {
            if (
              intent.current !== proposal ||
              !guard.ready() ||
              !guard.point ||
              !root.isConnected
            )
              return;
            const p = guard.point,
              rect = root.getBoundingClientRect();
            const element = document.elementFromPoint(p.x, p.y);
            const hit = element?.closest<HTMLElement>("[data-order-task]");
            const header = element?.closest<HTMLElement>("[data-order-target]");
            const owner = element?.closest("[data-order-scope]");
            const gap = owner === root && (!hit || !root.contains(hit));
            proposal.valid =
              p.x >= rect.left &&
              p.x <= rect.right &&
              p.y >= Math.max(0, rect.top) &&
              p.y <= Math.min(innerHeight, rect.bottom) &&
              (gap ||
                (owner === root &&
                  !!hit &&
                  scope.ids.includes(hit.dataset.orderTask!) &&
                  header?.closest("[data-order-task]") === hit));
            if (proposal.valid) {
              const index = siblingInsertion(
                centers,
                sourceCenter + p.y + window.scrollY - initialPointer,
                proposal.index,
              );
              if (index !== proposal.index) {
                proposal.index = index;
                proposal.ids = insertSibling(scope.ids, task.id, index);
                setPreview(proposal.ids);
              }
            }
          };
          updatePlacement.current = update;
          const tick = () => {
            update();
            if (intent.current === proposal)
              frame.current = requestAnimationFrame(tick);
          };
          frame.current = requestAnimationFrame(tick);
        }}
        onDragCancel={end}
        onDragEnd={() => {
          updatePlacement.current();
          const proposal = intent.current;
          end();
          if (
            !proposal?.valid ||
            !guard.ready() ||
            proposal.ids.every((id, i) => id === scope.ids[i])
          )
            return;
          void move(proposal.task, proposal.ids[proposal.index + 1] ?? null);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Hold then drag within these siblings. Use the task Actions menu for Move up and Move down.",
          },
        }}
      >
        <ul
          ref={list}
          data-order-scope={scope.scopeKey}
          data-order-preview={preview ? "true" : undefined}
          aria-label={
            scope.scopeKey.startsWith("project/")
              ? "Project task order"
              : "Subtask order"
          }
          className="relative ml-4 space-y-1 border-l py-3 pl-3"
        >
          {rendered}
        </ul>
        {createPortal(
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
            {lifted && (
              <div
                aria-hidden="true"
                data-order-overlay
                className="pointer-events-none rounded-lg border-2 border-teal-700 bg-white p-3 shadow-lg"
                style={{ minHeight: Math.min(lifted.height, 300) }}
              >
                <strong>{lifted.task.title}</strong>
                <p className="text-sm">Moving within siblings</p>
              </div>
            )}
          </DragOverlay>,
          document.querySelector<HTMLElement>("[data-session-state]")!,
        )}
      </DndContext>
    </Context.Provider>
  );
}

export function SiblingOrderRow({
  task,
  header,
  open,
  children,
}: {
  task: TaskRecord;
  header: React.ReactNode;
  open: () => void;
  children?: React.ReactNode;
}) {
  const group = useContext(Context),
    disabled = !group || group.disabled || group.pending;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled,
  });
  const node = useRef<HTMLLIElement | null>(null),
    previous = useRef<{
      top: number;
      key: string | undefined;
      dragging: boolean;
    } | null>(null),
    animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (!node.current) return;
    // offsetTop ignores document scroll and our running transform. Descendant
    // groups animate only their own order, never a second copy of a parent's move.
    const top = node.current.offsetTop;
    if (!group?.previewing) animation.current?.cancel();
    if (
      group?.previewing &&
      previous.current !== null &&
      previous.current.key !== group?.layoutKey &&
      !previous.current.dragging &&
      !isDragging &&
      Math.abs(previous.current.top - top) > 1 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      animation.current?.cancel();
      animation.current = node.current.animate(
        [
          { transform: `translateY(${previous.current.top - top}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 140, easing: "ease-out" },
      );
    }
    previous.current = { top, key: group?.layoutKey, dragging: isDragging };
  });
  const index = group?.scope.ids.indexOf(task.id) ?? -1;
  const action = (
    event: React.MouseEvent<HTMLButtonElement>,
    beforeId: string | null,
  ) => {
    const details = event.currentTarget.closest("details")!;
    details.open = false;
    details.querySelector("summary")?.focus({ preventScroll: true });
    group?.move(task, beforeId);
  };
  return (
    <li
      data-order-task={task.id}
      ref={(element) => {
        node.current = element;
        setNodeRef(element);
      }}
      className={
        isDragging
          ? "pointer-events-none rounded-lg outline-1 outline-dashed outline-teal-700 opacity-30"
          : ""
      }
    >
      <div
        {...listeners}
        data-drag-activator
        data-order-target={task.id}
        className="planner-drag-activator flex min-w-0 items-center gap-2 rounded border-b py-1"
        onClick={(event) => {
          const target = event.target as Element;
          if (
            !target.closest(
              "button:not([data-drag-edit]),a,summary,[data-no-drag]",
            )
          )
            open();
        }}
      >
        {header}
        {group && (
          <details data-drag-actions data-no-drag className="relative shrink-0">
            <summary
              aria-label={"Actions: " + task.title}
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border"
            >
              ⋯
            </summary>
            <div className="absolute right-0 z-30 w-56 rounded-lg border bg-white p-2 shadow-lg">
              {disabled && (
                <p className="mb-2 text-sm">
                  Clear filters, refresh incomplete siblings or resolve the
                  ordering proposal to move.
                </p>
              )}
              {group.pending && (
                <p className="mb-2 text-sm">Saving sibling order…</p>
              )}
              <button
                type="button"
                className={button + " w-full"}
                disabled={disabled || index <= 0}
                aria-label={"Move up: " + task.title}
                onClick={(event) => action(event, group.scope.ids[index - 1])}
              >
                Move up
              </button>
              <button
                type="button"
                className={button + " mt-2 w-full"}
                disabled={
                  disabled || index < 0 || index >= group.scope.ids.length - 1
                }
                aria-label={"Move down: " + task.title}
                onClick={(event) =>
                  action(event, group.scope.ids[index + 2] ?? null)
                }
              >
                Move down
              </button>
            </div>
          </details>
        )}
      </div>
      {children}
    </li>
  );
}
