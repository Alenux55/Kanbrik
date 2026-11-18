"use client";
import {
  matchesCalendarWork,
  matchesCalendarBlock,
} from "@/lib/calendar-filters";
import { labelsActive } from "@/lib/task-labels";
import { TaskLabelBadges } from "./task-labels";
import { PlannerFilters, TagMatchControl } from "./planner-filters";
import { EditorDialog } from "./ui/editor-dialog";
import { statusName } from "@/lib/task-statuses";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  calendarWorkDrop,
  calendarDropTiming,
  type Point,
} from "@/lib/calendar-drop";
import {
  useCalendarDropPreview,
  CalendarDropPreview,
  CalendarDragTitle,
} from "./calendar-drop-preview";
import Link from "next/link";
import { CalendarEventLabel } from "./calendar-event-label";
import { blockProjectId, eventText } from "@/lib/calendar-presentation";
import { projectColor } from "@/lib/board-filters";
import { themedTint } from "@/lib/project-palette";
import { usePlannerContext } from "./planner-context";
import { BlockEditor } from "./block-editor";
import FullCalendar from "@fullcalendar/react";
import timeGrid from "@fullcalendar/timegrid";
import interaction from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { DateTime } from "luxon";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { usePlannerSession } from "./planner-session";
import { usePlannerDrag } from "./use-planner-drag";
import { useCalendarTouch } from "./use-calendar-touch";
import { dragActivation, eventPoint } from "@/lib/planner-drag";
import { usePlanningDrafts } from "./planning-drafts";
import { calendarRange } from "@/lib/calendar-time";
import { blockDraft, type CalendarDraft } from "@/lib/calendar-draft";
import type { BlockRecord } from "@/lib/calendar-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { z } from "zod";
import type { editBlockInput } from "@/lib/calendar-contracts";
type BlockChanges = z.infer<typeof editBlockInput>["changes"];
const button =
  "min-h-12 min-w-0 max-w-full rounded-lg border border-neutral-400 px-3 py-2 [overflow-wrap:anywhere] disabled:opacity-50";
const control =
  "mt-1 block min-h-12 w-full min-w-0 rounded border border-neutral-400 bg-white px-3";
type Pref = {
  mode: "follow" | "custom";
  workspaces: WorkspaceSummary[];
  workspaceIds: string[];
  timeZone: string | null;
};
export type Work = {
  id: string;
  workspaceId: string;
  kind: "project" | "task";
  title: string;
  context: string;
  searchContext: string[];
  record: ProjectRecord | TaskRecord;
};
type Scope = {
  workspace: WorkspaceSummary;
  blocks: BlockRecord[];
  work: Work[];
  failed: boolean;
  pickerFailed: boolean;
};
const display = (iso: string, zone: string) =>
  DateTime.fromISO(iso).setZone(zone).toFormat("ccc dd LLL HH:mm ZZ");
export function CalendarPlanner() {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const store = usePlanningDrafts();
  const [filterHost, setFilterHost] = useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState(false);
  const [mode, setMode] = useState<"follow" | "custom">("follow");
  const [matchAll, setMatchAll] = useState(false);
  const [prefs, setPrefs] = useState<Pref | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [day, setDay] = useState("");
  const [view, setView] = useState("day");
  const initialized = useRef(false);
  const [preferenceRetry, setPreferenceRetry] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    session
      .fetch("/api/calendar/preferences")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result: Pref = await response.json();
        if (!active || !session.isCurrent(lease)) return;
        setPrefs(result);
        setMode(result.mode);
        setIds(result.workspaceIds);
        const initialZone =
          result.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        setDay(
          (current) =>
            current ||
            DateTime.now().setZone(initialZone).toISODate() ||
            DateTime.utc().toISODate()!,
        );
        if (
          !initialized.current &&
          window.matchMedia("(min-width: 1024px)").matches
        )
          setView("week");
        initialized.current = true;
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setError("Calendar preferences unavailable. Retry Refresh calendar.");
      });
    return () => {
      active = false;
    };
    // Preference reload preserves date; display zone comes only from account settings.
  }, [session, lease, preferenceRetry]);
  async function apply(
    selected = ids,
    tagsAll = matchAll,
    selectedMode = mode,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await session.fetch("/api/calendar/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedMode,
          workspaceIds: selectedMode === "follow" ? [] : selected,
        }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      if (session.isCurrent(lease)) {
        setPrefs((current) => current && { ...current, ...saved });
        setIds(saved.workspaceIds);
        setMode(saved.mode);
        store.setViewLabels((current) => ({
          ...current,
          calendar: { ...current.calendar, matchAll: tagsAll },
        }));
        setPanel(false);
        setEditing(null);
      }
    } catch {
      if (session.isCurrent(lease))
        setError("Preferences not saved. Input is kept; retry.");
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
          ...current,
          workspaces: current.workspaces.filter((w) => w.id !== id),
          workspaceIds: current.workspaceIds.filter((value) => value !== id),
        },
    );
    setIds((current) => current.filter((value) => value !== id));
    setError(
      "Workspace access ended. Its calendar content and drafts were removed.",
    );
  }
  const visibleIds = !prefs
    ? []
    : prefs.mode === "follow"
      ? [context.defaultWorkspaceId]
      : prefs.workspaceIds.filter((id) =>
          context.workspaces.some((workspace) => workspace.id === id),
        );
  const dirty =
    panel &&
    prefs &&
    (mode !== prefs.mode ||
      (mode === "custom" &&
        (ids.length !== prefs.workspaceIds.length ||
          ids.some((id) => !prefs.workspaceIds.includes(id)))));
  const range = day ? calendarRange(day, context.zone, view !== "day") : null;
  return (
    <section className="min-w-0 [overflow-wrap:anywhere]">
      <h1 className="text-4xl font-semibold">Calendar</h1>
      <p className="mt-3">
        Scheduling never changes task status. Saves require a connection.
      </p>
      {error && !panel && (
        <p role="alert" className="mt-4 text-red-800">
          {error}
        </p>
      )}
      <button
        className={`${button} mt-4`}
        onClick={() => {
          if (dirty || pending) {
            setError(
              "Apply calendar preferences before refreshing; input is kept.",
            );
            return;
          }
          setError("");
          setPrefs(null);
          context.refresh();
          setPreferenceRetry((value) => value + 1);
        }}
      >
        Refresh calendar
      </button>
      {!prefs ? (
        <p role="status">Loading preferences…</p>
      ) : (
        <>
          {panel && (
            <EditorDialog
              title="Calendar advanced filters"
              dirty={false}
              pending={pending}
              close={() => {
                setIds(visibleIds);
                setMode(prefs.mode);
                setError("");
                setPanel(false);
              }}
              discard={() => {}}
            >
              {error && <p role="alert">{error}</p>}
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void apply();
                }}
              >
                <fieldset disabled={pending} className="space-y-3">
                  <legend>Calendar scope (independent of Board)</legend>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="calendar-scope"
                      value="follow"
                      checked={mode === "follow"}
                      onChange={() => setMode("follow")}
                    />
                    Follow creation workspace
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="calendar-scope"
                      value="custom"
                      checked={mode === "custom"}
                      onChange={() => setMode("custom")}
                    />
                    Selected workspaces
                  </label>
                  {mode === "custom" &&
                    context.workspaces.map((w) => (
                      <label
                        key={w.id}
                        className="flex min-h-11 items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={ids.includes(w.id)}
                          onChange={(event) =>
                            setIds((current) =>
                              event.target.checked
                                ? [...current, w.id]
                                : current.filter((id) => id !== w.id),
                            )
                          }
                        />
                        {w.name} ({w.kind})
                      </label>
                    ))}
                  <TagMatchControl value={matchAll} change={setMatchAll} />
                  <button className={button}>
                    {pending ? "Saving…" : "Apply filters"}
                  </button>{" "}
                </fieldset>
              </form>
            </EditorDialog>
          )}
          <p>
            Display zone: {context.zone}.{" "}
            <Link className="underline" href="/settings">
              User settings
            </Link>
          </p>
          <p className="my-2 text-sm">
            {prefs.mode === "follow"
              ? "Following creation workspace"
              : "Selected workspaces"}{" "}
            ·{" "}
            {visibleIds.length
              ? context.workspaces
                  .filter((w) => visibleIds.includes(w.id))
                  .map((w) => w.name)
                  .join(", ")
              : "None"}
          </p>
          <div ref={setFilterHost} />
          {
            <>
              <div className="my-4 flex flex-wrap items-end gap-3">
                <label>
                  Date
                  <input
                    type="date"
                    className={control}
                    value={day}
                    onChange={(event) => {
                      if (event.target.value) {
                        setDay(event.target.value);
                        setEditing(null);
                      }
                    }}
                  />
                </label>
                {(
                  [
                    ["Previous", -1],
                    ["Today", 0],
                    ["Next", 1],
                  ] as const
                ).map(([label, direction]) => (
                  <button
                    key={label}
                    className={button}
                    onClick={() => {
                      setDay(
                        direction
                          ? DateTime.fromISO(day)
                              .plus(
                                view !== "day"
                                  ? { weeks: direction }
                                  : { days: direction },
                              )
                              .toISODate()!
                          : DateTime.now().setZone(context.zone).toISODate()!,
                      );
                      setEditing(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <label>
                  View
                  <select
                    aria-label="View"
                    className={control}
                    value={view}
                    onChange={(event) => {
                      setView(event.target.value);
                      setEditing(null);
                    }}
                  >
                    <option value="week">Week grid</option>
                    <option value="day">Day grid</option>
                    <option value="agenda">Agenda (week)</option>
                  </select>
                </label>
              </div>
              <p className="my-4">
                Range:{" "}
                {range &&
                  `${display(range.start, context.zone)} – ${display(range.end, context.zone)}`}
              </p>
            </>
          }
          <>
            {range && (
              <CalendarScope
                key={`${preferenceRetry}:${visibleIds.join(",")}:${context.zone}:${day}:${view}`}
                workspaces={context.workspaces}
                visibleIds={visibleIds}
                zone={context.zone}
                day={day}
                view={view}
                range={range}
                editing={editing}
                setEditing={setEditing}
                revoked={revoked}
                filterHost={filterHost}
                advanced={() => {
                  setIds(visibleIds);
                  setMode(prefs.mode);
                  setMatchAll(store.viewLabels.calendar.matchAll);
                  setPanel(true);
                }}
                paused={panel || pending}
              />
            )}
          </>
        </>
      )}
    </section>
  );
}

function CalendarScope({
  workspaces,
  visibleIds,
  zone,
  day,
  view,
  range,
  editing,
  setEditing,
  revoked,
  advanced,
  paused,
  filterHost,
}: {
  workspaces: WorkspaceSummary[];
  visibleIds: string[];
  zone: string;
  day: string;
  view: string;
  range: { start: string; end: string };
  editing: string | null;
  setEditing: (id: string | null) => void;
  revoked: (id: string) => void;
  advanced: () => void;
  paused: boolean;
  filterHost: HTMLDivElement | null;
}) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const store = usePlanningDrafts();
  const {
    saveEpoch,
    beginSave,
    finishSave,
    savingKeys,
    setCalendarDrafts,
    calendarDrafts,
  } = store;
  const [scopes, setScopes] = useState<Scope[] | null>(null);
  const [destination, setDestination] = useState(context.defaultWorkspaceId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragged, setDragged] = useState<Work | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dropFeedback = useCalendarDropPreview({
    root,
    session,
    lease,
    context: scopes,
    filter: paused ? null : store.viewLabels.calendar,
    resolve: resolveDrop,
  });
  function resolveDrop(sourceId: string, point: Point) {
    if (paused || !root.current || !scopes) return null;
    const filter = store.viewLabels.calendar;
    const item = scopes
      .flatMap((s) => s.work)
      .find((w) => `${w.kind}:${w.id}` === sourceId);
    const scope =
      item && scopes.find((s) => s.workspace.id === item.workspaceId);
    if (!item || !scope || scope.failed || scope.pickerFailed) return null;
    if (
      !visibleIds.includes(item.workspaceId) ||
      !matchesCalendarWork(item, filter)
    )
      return null;
    const blocks = scopes
      .filter((s) => visibleIds.includes(s.workspace.id))
      .flatMap((s) => s.blocks)
      .filter((block) => matchesCalendarBlock(block, filter));
    return calendarWorkDrop({
      root: root.current,
      point,
      sourceId,
      workspaceId: item.workspaceId,
      workspaceName: scope.workspace.name,
      workTitle: item.title,
      projectId:
        item.kind === "project"
          ? item.id
          : (item.record as TaskRecord).projectId,
      zone,
      blocks,
      newBlocked:
        !!calendarDrafts[`${item.workspaceId}/blocks/new`]?.dirty ||
        savingKeys.includes(`calendar:${item.workspaceId}/blocks/new`),
      blockBlocked: (block) =>
        !!calendarDrafts[`${block.workspaceId}/blocks/${block.id}`]?.dirty ||
        savingKeys.includes(`calendar:${block.id}`),
    });
  }
  const suppressClick = useRef(false);
  const gestureActive = useRef(false);
  const alive = useRef(true);
  const version = useRef(0);
  const canceledGesture = useRef(false);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        canceledGesture.current = true;
        if (gestureActive.current)
          setNotice("Gesture canceled. No change was saved.");
      } else if (
        !gestureActive.current &&
        (event.key === "Enter" || event.key === " ")
      )
        suppressClick.current = false;
    };
    const intentionalPress = () => {
      if (!gestureActive.current) suppressClick.current = false;
    };
    document.addEventListener("keydown", cancel, true);
    document.addEventListener("pointerdown", intentionalPress, true);
    return () => {
      document.removeEventListener("keydown", cancel, true);
      document.removeEventListener("pointerdown", intentionalPress, true);
    };
  }, []);
  const gestureParts = [
    scopes,
    calendarDrafts,
    savingKeys.join("|"),
    store.viewLabels.calendar,
    paused,
    zone,
    day,
    view,
    visibleIds.join(","),
  ];
  const { sensors } = usePlannerDrag(
    gestureParts,
    !paused && !!scopes,
    "calendar",
  );
  const nativeTouch = useCalendarTouch({
    root,
    parts: gestureParts,
    enabled: !paused,
    active: gestureActive,
    canceled: canceledGesture,
    suppressClick,
    onTap: (id) => {
      if (
        !savingKeys.includes(`calendar:${id}`) &&
        scopes?.some((scope) => scope.blocks.some((block) => block.id === id))
      )
        setEditing(id);
    },
  });
  function lost(id: string) {
    if (!alive.current || !session.isCurrent(lease)) return;
    if (editing === "new" && destination === id) setEditing(null);
    setCalendarDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${id}/`)),
      ),
    );
    revoked(id);
  }
  useEffect(() => {
    alive.current = true;
    const seq = ++version.current;
    Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const path = `/api/workspaces/${workspace.id}`;
          const [events, tasks, projects] = await Promise.all([
            visibleIds.includes(workspace.id)
              ? session.fetch(
                  `${path}/time-blocks?${new URLSearchParams(range)}`,
                )
              : Promise.resolve(Response.json([])),
            session.fetch(`${path}/tasks`),
            session.fetch(`${path}/projects`),
          ]);
          if (
            [events, tasks, projects].some(
              (response) => response.status === 404,
            )
          ) {
            if (
              alive.current &&
              seq === version.current &&
              session.isCurrent(lease)
            )
              lost(workspace.id);
            return null;
          }
          if (!events.ok) throw new Error();
          const pickerFailed = !tasks.ok || !projects.ok;
          const ts: TaskRecord[] = tasks.ok ? await tasks.json() : [];
          const ps: ProjectRecord[] = projects.ok ? await projects.json() : [];
          const work: Work[] = pickerFailed
            ? []
            : [
                ...ps.map((item) => ({
                  record: item,
                  id: item.id,
                  workspaceId: workspace.id,
                  kind: "project" as const,
                  title: item.title,
                  context: "Project",
                  searchContext: [],
                })),
                ...ts.map((item) => ({
                  record: item,
                  id: item.id,
                  workspaceId: workspace.id,
                  kind: "task" as const,
                  title: item.title,
                  context: `${statusName(item)} · ${ps.find((p) => p.id === item.projectId)?.title ?? "Standalone"}${item.parentId ? ` · Subtask of ${ts.find((t) => t.id === item.parentId)?.title}` : ""}`,
                  searchContext: [
                    ps.find((p) => p.id === item.projectId)?.title ?? "",
                    ts.find((t) => t.id === item.parentId)?.title ?? "",
                  ],
                })),
              ];
          return {
            workspace,
            blocks: (await events.json()) as BlockRecord[],
            work,
            pickerFailed,
            failed: false,
          };
        } catch {
          return {
            workspace,
            blocks: [],
            work: [],
            pickerFailed: true,
            failed: true,
          };
        }
      }),
    ).then((result) => {
      if (alive.current && seq === version.current && session.isCurrent(lease))
        setScopes(result.filter((item): item is Scope => item !== null));
    });
    return () => {
      alive.current = false;
    };
    // Selection/range/zone are immutable for this mounted asynchronous context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, saveEpoch]);
  function saved(record: BlockRecord | { deleted: true; id: string }) {
    setScopes(
      (current) =>
        current?.map((scope) => ({
          ...scope,
          blocks:
            "deleted" in record
              ? scope.blocks.filter((item) => item.id !== record.id)
              : [
                  ...scope.blocks.filter((item) => item.id !== record.id),
                  ...(scope.workspace.id === record.workspaceId &&
                  Date.parse(record.startAt) < Date.parse(range.end) &&
                  Date.parse(record.endAt) > Date.parse(range.start)
                    ? [record]
                    : []),
                ],
        })) ?? null,
    );
    if ("deleted" in record) {
      setEditing(null);
      setNotice("Block removed. Referenced work is unchanged.");
    }
  }
  function retainGesture(
    block: BlockRecord,
    changes: BlockChanges,
    conflict?: BlockRecord,
    confirmOccurrences = false,
  ) {
    let proposed = blockDraft(block, zone);
    if (changes.schedule)
      proposed = {
        ...proposed,
        ...blockDraft({ ...block, ...changes.schedule }, zone),
        dirty: true,
      };
    if (changes.assignment)
      proposed.assignment = changes.assignment.projectId
        ? `project:${changes.assignment.projectId}`
        : changes.assignment.taskId
          ? `task:${changes.assignment.taskId}`
          : "";
    proposed.base = block;
    if (confirmOccurrences) {
      proposed.startChoice = "";
      proposed.endChoice = "";
    }
    proposed.conflict = conflict;
    setCalendarDrafts((current) => ({
      ...current,
      [`${block.workspaceId}/blocks/${block.id}`]: proposed,
    }));
  }
  async function gesture(block: BlockRecord, changes: BlockChanges) {
    if (!alive.current || !session.isCurrent(lease)) return;
    if (calendarDrafts[`${block.workspaceId}/blocks/${block.id}`]?.dirty) {
      setError(
        "This block has a retained draft. Review or discard it before a gesture.",
      );
      return;
    }
    const key = `calendar:${block.id}`;
    if (!beginSave(key)) return;
    let committed = false;
    // Capture recoverable input before dispatch; it survives route/range changes.
    retainGesture(block, changes);
    try {
      const response = await session.fetch(
        `/api/workspaces/${block.workspaceId}/time-blocks/${block.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: block.revision, changes }),
        },
      );
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok)
        setCalendarDrafts((current) => {
          const next = { ...current };
          delete next[`${block.workspaceId}/blocks/${block.id}`];
          return next;
        });
      if (!alive.current) return;
      if (response.status === 404) {
        // Record-level 404 also covers a collaborator deleting this block.
        // Only a separate denied workspace read confirms access was revoked.
        const access = await session.fetch(
          `/api/workspaces/${block.workspaceId}`,
        );
        if (!alive.current || !session.isCurrent(lease)) return;
        if (access.status === 404) {
          lost(block.workspaceId);
          return;
        }
        if (!access.ok) {
          setError(
            "Save unconfirmed; workspace access could not be checked. Retry the original intent.",
          );
          return;
        }
        setScopes(
          (current) =>
            current?.map((scope) => ({
              ...scope,
              blocks: scope.blocks.filter((item) => item.id !== block.id),
            })) ?? null,
        );
        setError(
          "Time block is no longer available. Proposed change retained; other workspace content is unchanged.",
        );
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 409
            ? `Conflict. Saved revision ${result.current?.revision}; proposed change retained. Review saved block before retrying.`
            : "Save not confirmed. Proposed change retained; review and retry explicitly.",
        );
        retainGesture(block, changes, result.current);
        return;
      }
      saved(result);
      setError("");
      setNotice("Saved calendar change.");
    } catch {
      if (alive.current && session.isCurrent(lease))
        setError(
          "Save not confirmed. Proposed change retained in the editing form.",
        );
    } finally {
      finishSave(key, committed);
    }
  }
  function openNew(item?: Work, wall = `${day}T12:00`, autoSave = false) {
    if (!alive.current || !session.isCurrent(lease)) return;
    const ws = item?.workspaceId ?? context.defaultWorkspaceId;
    const scope = scopes?.find((s) => s.workspace.id === ws);
    if (!scope || scope.pickerFailed) {
      setError("Work context unavailable. Refresh calendar before scheduling.");
      return;
    }
    const key = `${ws}/blocks/new`;
    setDestination(ws);
    if (!autoSave) setEditing("new");
    if (calendarDrafts[key]?.dirty || savingKeys.includes(`calendar:${key}`)) {
      setError(
        "Review or discard the retained new-block intent before scheduling another.",
      );
      return;
    }
    const timing = calendarDropTiming(wall, zone);
    const draft: CalendarDraft = {
      label: item?.title ?? "Time block",
      zone,
      ...timing,
      assignment: item ? `${item.kind}:${item.id}` : "",
      revision: 1,
      requestKey: crypto.randomUUID(),
      pointerDuration: 60,
      dirty: true,
    };
    setCalendarDrafts((current) => ({ ...current, [key]: draft }));
    if (!autoSave || !draft.startChoice || !draft.endChoice) {
      if (autoSave)
        setError(
          "Confirm valid local times and explicit repeated-time occurrences before saving.",
        );
      return;
    }
    void createDropped(ws, draft);
  }
  async function createDropped(ws: string, draft: CalendarDraft) {
    const key = `${ws}/blocks/new`;
    const lock = `calendar:${key}`;
    if (!beginSave(lock)) return;
    let committed = false;
    const intent = { ...draft, uncertain: "create" as const };
    setCalendarDrafts((current) => ({ ...current, [key]: intent }));
    try {
      const payload = {
        requestKey: draft.requestKey,
        label: draft.label,
        schedule: {
          startAt: draft.startChoice,
          endAt: draft.endChoice,
          timeZone: draft.zone,
        },
        assignment: {
          projectId: draft.assignment.startsWith("project:")
            ? draft.assignment.slice(8)
            : null,
          taskId: draft.assignment.startsWith("task:")
            ? draft.assignment.slice(5)
            : null,
        },
      };
      const response = await session.fetch(
        `/api/workspaces/${ws}/time-blocks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok)
        setCalendarDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      else if (response.status < 500)
        setCalendarDrafts((current) => ({
          ...current,
          [key]: { ...intent, uncertain: undefined },
        }));
      if (!alive.current) return;
      if (response.status === 404) {
        const access = await session.fetch(`/api/workspaces/${ws}`);
        if (!alive.current || !session.isCurrent(lease)) return;
        if (access.status === 404) {
          lost(ws);
          return;
        }
      }
      if (!response.ok) {
        setError(
          "Create not confirmed. Original input and intent retained for explicit retry.",
        );
        return;
      }
      saved(result);
      setError("");
      setNotice(
        `Saved one-hour block in ${workspaces.find((w) => w.id === ws)?.name}. Referenced work is unchanged.`,
      );
    } catch {
      if (alive.current && session.isCurrent(lease))
        setError(
          "Create unconfirmed. Retry the retained original intent; do not create a duplicate.",
        );
    } finally {
      finishSave(lock, committed);
    }
  }

  if (!scopes) return <p role="status">Loading calendar…</p>;
  const labelFilter = store.viewLabels.calendar,
    labelActive = labelsActive(labelFilter);
  const unfilteredBlocks = scopes
    .filter((scope) => visibleIds.includes(scope.workspace.id))
    .flatMap((scope) => scope.blocks);
  const work = scopes.flatMap((scope) => scope.work);
  const paletteWork = work.filter((item) =>
    visibleIds.includes(item.workspaceId),
  );
  const search = (labelFilter.search ?? "").trim().toLowerCase(),
    projectFilter = labelFilter.projects ?? [];
  const displayFiltering = labelActive || !!search || !!projectFilter.length;
  const matchesWork = (item: Work) => matchesCalendarWork(item, labelFilter);
  const all = unfilteredBlocks.filter((block) =>
    matchesCalendarBlock(block, labelFilter),
  );
  const retained = Object.values(calendarDrafts).filter(
    (draft) =>
      draft.base &&
      scopes.some(
        (scope) =>
          !scope.failed && scope.workspace.id === draft.base!.workspaceId,
      ),
  );
  const selected =
    unfilteredBlocks.find((block) => block.id === editing) ??
    retained.find((draft) => draft.base?.id === editing)?.base;
  // Input stays in the shared store while its editor/request owns it. Showing
  // a second recovery section underneath a pending save changes page geometry.
  const reviewable = retained.filter(
    (draft) =>
      draft.base!.id !== editing &&
      !savingKeys.includes(`calendar:${draft.base!.id}`),
  );
  const incomplete = scopes.some((scope) => scope.failed);
  return (
    <div ref={root} data-calendar-gesture-region className="min-w-0">
      <div
        data-calendar-feedback
        className="h-20 overflow-y-auto break-words py-2"
      >
        {incomplete && (
          <p role="alert">
            Calendar incomplete. Failed workspaces have no editable stale
            events; counts cover loaded scopes only. Refresh calendar to retry.
          </p>
        )}
        {scopes.some((scope) => scope.pickerFailed) && (
          <p role="alert">
            Work picker incomplete. Assignment/create controls are unavailable
            for failed scopes; refresh to retry.
          </p>
        )}
        {error && (
          <p role="status" className="text-red-800">
            {error}
          </p>
        )}
        {savingKeys.some((key) => key.startsWith("calendar:")) ? (
          <p role="status">Saving Calendar change…</p>
        ) : (
          notice && (
            <p role="status" className="text-teal-800">
              {notice}
            </p>
          )
        )}
      </div>
      {filterHost &&
        createPortal(
          <PlannerFilters
            value={labelFilter}
            change={(value) =>
              store.setViewLabels((current) => ({
                ...current,
                calendar: value,
              }))
            }
            workspaceIds={visibleIds}
            projects={work
              .filter(
                (item) =>
                  item.kind === "project" &&
                  visibleIds.includes(item.workspaceId) &&
                  context.workspaces.some(
                    (workspace) => workspace.id === item.workspaceId,
                  ),
              )
              .map((item) => ({
                id: item.id,
                title:
                  item.title +
                  " (" +
                  scopes.find(
                    (scope) => scope.workspace.id === item.workspaceId,
                  )?.workspace.name +
                  ")",
              }))}
            projectError={
              scopes.some(
                (scope) =>
                  visibleIds.includes(scope.workspace.id) && scope.pickerFailed,
              )
                ? "Project choices incomplete. Filters kept; refresh to retry."
                : undefined
            }
            disabled={paused}
            placeholder="Search work and blocks"
            advancedCount={Number(labelFilter.matchAll)}
            advanced={advanced}
          />,
          filterHost,
        )}
      <p className="my-3">
        {displayFiltering ? "Matching" : ""} {incomplete ? "Loaded" : "Total"}{" "}
        blocks in range: {all.length}
        {displayFiltering ? ` of ${unfilteredBlocks.length} total` : ""}.
        Matching work cards: {paletteWork.filter(matchesWork).length} of{" "}
        {paletteWork.length}. Overlaps allowed; intervals end exclusively.
      </p>
      <button
        type="button"
        className={button}
        onClick={() => {
          setDestination(context.defaultWorkspaceId);
          setEditing("new");
        }}
      >
        New block
      </button>
      <DndContext
        sensors={sensors}
        autoScroll={false}
        onDragStart={({ active, activatorEvent }) => {
          dropFeedback.controller.start(
            String(active.id),
            eventPoint(activatorEvent),
          );
          canceledGesture.current = false;
          suppressClick.current = true;
          gestureActive.current = true;
          setDragged(
            work.find((item) => item.kind + ":" + item.id === active.id) ??
              null,
          );
        }}
        onDragCancel={() => {
          dropFeedback.controller.cancel();
          setDragged(null);
          gestureActive.current = false;
          setNotice("Gesture canceled. No change was saved.");
        }}
        onDragEnd={() => {
          const candidate = dropFeedback.controller.finish(dropFeedback.scene);
          setDragged(null);
          gestureActive.current = false;
          if (!candidate || canceledGesture.current) return;
          if (candidate.kind === "unavailable") {
            setError(candidate.message!);
            return;
          }
          const item = work.find(
            (value) => `${value.kind}:${value.id}` === candidate.sourceId,
          );
          if (!item) return;
          if (candidate.kind === "blank") {
            openNew(item, candidate.wall!, true);
            return;
          }
          void gesture(candidate.block!, {
            assignment: {
              projectId: item.kind === "project" ? item.id : null,
              taskId: item.kind === "task" ? item.id : null,
            },
          });
        }}
      >
        <div className="my-5 flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div
            className="order-2 max-h-[400px] min-w-0 overflow-auto rounded border p-3 lg:order-none lg:max-h-[650px]"
            aria-label="Calendar work palette"
            data-drag-scroll="y"
          >
            <h2 className="font-semibold">
              Work cards: edit, or drag onto the grid to schedule
            </h2>
            {scopes
              .filter((scope) => visibleIds.includes(scope.workspace.id))
              .map((scope) => (
                <div key={scope.workspace.id}>
                  <h3>{scope.workspace.name}</h3>
                  {scope.work.filter(matchesWork).map((item) => (
                    <Palette
                      key={`${item.kind}:${item.id}`}
                      item={item}
                      open={() => {
                        if (
                          !suppressClick.current &&
                          session.getSnapshot().phase === "ready"
                        )
                          context.openEntity({
                            kind:
                              item.kind === "project" ? "projects" : "tasks",
                            workspaceId: item.workspaceId,
                            record: item.record,
                          });
                      }}
                    />
                  ))}
                </div>
              ))}
          </div>
          <div className="order-1 min-w-0 overflow-x-auto overscroll-x-contain lg:order-none">
            {view === "agenda" ? (
              <section aria-label="Agenda" className="space-y-2">
                <h2 className="text-xl font-semibold">Agenda</h2>
                {!all.length && (
                  <p className="my-3">
                    {incomplete
                      ? "Schedule incomplete. Refresh calendar to retry."
                      : displayFiltering
                        ? "No matching blocks. Clear filters to show available reservations."
                        : "No blocks in this range. Use New block to choose work and time."}
                  </p>
                )}
                {[...all]
                  .sort((a, b) => a.startAt.localeCompare(b.startAt))
                  .map((block) => (
                    <div
                      key={block.id}
                      className="min-w-0 rounded border p-2"
                      style={{
                        backgroundColor: themedTint(
                          projectColor(blockProjectId(block)),
                        ),
                      }}
                    >
                      {block.workInTrash && (
                        <p className="mb-1 text-sm">
                          Work in Trash ·{" "}
                          <Link
                            className="underline"
                            href={`/trash?workspaceId=${encodeURIComponent(block.workspaceId)}`}
                          >
                            Review workspace Trash / Restore
                          </Link>
                        </p>
                      )}
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <BlockTarget
                            block={block}
                            surface="agenda"
                            zone={zone}
                            title={block.label}
                          />
                          <p className="break-words text-xs">
                            {DateTime.fromISO(block.startAt)
                              .setZone(zone)
                              .toFormat("ccc d LLL")}
                            {" · "}
                            {
                              scopes.find(
                                (scope) =>
                                  scope.workspace.id === block.workspaceId,
                              )?.workspace.name
                            }
                            {block.task ? " · " + statusName(block.task) : ""}
                          </p>
                        </div>
                        <button
                          className={button}
                          aria-label={"Edit block: " + block.label}
                          aria-describedby={"calendar-block-agenda-" + block.id}
                          disabled={savingKeys.includes(`calendar:${block.id}`)}
                          onClick={() => setEditing(block.id)}
                        >
                          Edit
                        </button>
                      </div>
                      {!!block.task?.tags?.length && (
                        <TaskLabelBadges task={block.task} />
                      )}
                    </div>
                  ))}
              </section>
            ) : (
              <div
                className={
                  view === "week" ? "min-w-[42rem] lg:min-w-0" : "min-w-0"
                }
              >
                <FullCalendar
                  key={`${day}:${view}:${zone}:${nativeTouch.revision}`}
                  plugins={[timeGrid, interaction, luxonPlugin]}
                  initialView={view === "week" ? "timeGridWeek" : "timeGridDay"}
                  initialDate={day}
                  firstDay={1}
                  timeZone={zone}
                  fixedMirrorParent={document.querySelector<HTMLElement>(
                    "[data-session-state]",
                  )!}
                  dateClick={(info) => {
                    if (
                      !suppressClick.current &&
                      session.getSnapshot().phase === "ready"
                    )
                      openNew(
                        undefined,
                        DateTime.fromJSDate(info.date)
                          .setZone(zone)
                          .toFormat("yyyy-MM-dd'T'HH:mm"),
                      );
                  }}
                  eventDidMount={(info) => {
                    info.el.dataset.calendarBlockId = info.event.id;
                    info.el.tabIndex = 0;
                    info.el.setAttribute("role", "button");
                    const block = all.find(
                      (value) => value.id === info.event.id,
                    );
                    info.el.setAttribute(
                      "aria-label",
                      "Edit block: " + (block?.label ?? info.event.title),
                    );
                    info.el.setAttribute(
                      "aria-describedby",
                      "calendar-block-grid-" + info.event.id,
                    );
                    info.el.addEventListener("keydown", (event) => {
                      if (
                        (event.key === "Enter" || event.key === " ") &&
                        !gestureActive.current
                      ) {
                        event.preventDefault();
                        info.el.click();
                      }
                    });
                  }}
                  headerToolbar={false}
                  allDaySlot={false}
                  height="max(380px, min(70vh, 650px))"
                  eventLongPressDelay={dragActivation.touchDelay}
                  dragRevertDuration={0}
                  dragScroll={false}
                  slotMinTime="00:00:00"
                  scrollTime="09:00:00"
                  snapDuration="00:15:00"
                  editable
                  eventAllow={() =>
                    !canceledGesture.current &&
                    !paused &&
                    session.getSnapshot().phase === "ready" &&
                    !document.querySelector("dialog[open]")
                  }
                  eventDragStop={(info) => {
                    if (!nativeTouch.owns(info.jsEvent)) return;
                    gestureActive.current = false;
                    if (canceledGesture.current)
                      setNotice("Gesture canceled. No change was saved.");
                  }}
                  eventResizeStop={(info) => {
                    if (!nativeTouch.owns(info.jsEvent)) return;
                    gestureActive.current = false;
                    if (canceledGesture.current)
                      setNotice("Gesture canceled. No change was saved.");
                  }}
                  eventDragStart={(info) => {
                    if (!nativeTouch.owns(info.jsEvent)) return;
                    gestureActive.current = true;
                    suppressClick.current = true;
                  }}
                  eventResizeStart={(info) => {
                    if (!nativeTouch.owns(info.jsEvent)) return;
                    gestureActive.current = true;
                    suppressClick.current = true;
                  }}
                  eventDragMinDistance={8}
                  eventDurationEditable
                  eventResizableFromStart
                  events={all.map((block) => ({
                    id: block.id,
                    title: block.label,
                    start: block.startAt,
                    end: block.endAt,
                    backgroundColor: themedTint(
                      projectColor(blockProjectId(block)),
                    ),
                    borderColor: "var(--border)",
                    textColor: "var(--foreground)",
                    editable:
                      !paused &&
                      !savingKeys.includes(`calendar:${block.id}`) &&
                      !calendarDrafts[`${block.workspaceId}/blocks/${block.id}`]
                        ?.dirty,
                  }))}
                  eventContent={(info) => {
                    const block = all.find(
                      (value) => value.id === info.event.id,
                    );
                    if (!block) return null;
                    return (
                      <BlockTarget
                        block={block}
                        surface="grid"
                        zone={zone}
                        title={`${info.timeText} ${block.label} · ${scopes.find((scope) => scope.workspace.id === block.workspaceId)?.workspace.name} · ${block.workInTrash ? "Work in Trash · " : ""}${block.project?.title ?? block.task?.title ?? "Empty block"}`}
                      />
                    );
                  }}
                  eventClick={(info) => {
                    if (
                      !suppressClick.current &&
                      session.getSnapshot().phase === "ready" &&
                      !savingKeys.includes(`calendar:${info.event.id}`)
                    )
                      setEditing(info.event.id);
                  }}
                  eventDrop={(info) => {
                    if (
                      !nativeTouch.moved(info.jsEvent) ||
                      canceledGesture.current ||
                      !alive.current ||
                      session.getSnapshot().phase !== "ready" ||
                      document.querySelector("dialog[open]")
                    ) {
                      info.revert();
                      return;
                    }
                    const block = all.find(
                      (value) => value.id === info.event.id,
                    );
                    if (!block) {
                      info.revert();
                      return;
                    }
                    const start = DateTime.fromJSDate(
                      info.event.start!,
                    ).setZone(zone);
                    const end = start.plus({
                      milliseconds:
                        Date.parse(block.endAt) - Date.parse(block.startAt),
                    });
                    info.revert();
                    if (start.toMillis() === Date.parse(block.startAt)) return;
                    if (
                      start.getPossibleOffsets().length > 1 ||
                      end.getPossibleOffsets().length > 1
                    ) {
                      retainGesture(
                        block,
                        {
                          schedule: {
                            startAt: start.toISO()!,
                            endAt: end.toISO()!,
                            timeZone: zone,
                          },
                        },
                        undefined,
                        true,
                      );
                      setError(
                        "Ambiguous pointer time. Confirm occurrences explicitly in the editing form.",
                      );
                      return;
                    }
                    void gesture(block, {
                      schedule: {
                        startAt: start.toISO()!,
                        endAt: end.toISO()!,
                        timeZone: zone,
                      },
                    });
                  }}
                  eventResize={(info) => {
                    if (
                      !nativeTouch.moved(info.jsEvent) ||
                      canceledGesture.current ||
                      !alive.current ||
                      session.getSnapshot().phase !== "ready" ||
                      document.querySelector("dialog[open]")
                    ) {
                      info.revert();
                      return;
                    }
                    const block = all.find(
                      (value) => value.id === info.event.id,
                    );
                    if (!block) {
                      info.revert();
                      return;
                    }
                    const start = DateTime.fromJSDate(
                        info.event.start!,
                      ).setZone(zone),
                      end = DateTime.fromJSDate(info.event.end!).setZone(zone);
                    info.revert();
                    if (
                      start.toMillis() === Date.parse(block.startAt) &&
                      end.toMillis() === Date.parse(block.endAt)
                    )
                      return;
                    if (
                      start.getPossibleOffsets().length > 1 ||
                      end.getPossibleOffsets().length > 1
                    ) {
                      retainGesture(
                        block,
                        {
                          schedule: {
                            startAt: start.toISO()!,
                            endAt: end.toISO()!,
                            timeZone: zone,
                          },
                        },
                        undefined,
                        true,
                      );
                      setError(
                        "Ambiguous boundary. Confirm in the editing form.",
                      );
                      return;
                    }
                    void gesture(block, {
                      schedule: {
                        startAt: start.toISO()!,
                        endAt: end.toISO()!,
                        timeZone: zone,
                      },
                    });
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {createPortal(
          <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
            {dragged && (
              <CalendarDragTitle
                controller={dropFeedback.controller}
                title={dragged.title}
              />
            )}
          </DragOverlay>,
          document.querySelector<HTMLElement>("[data-session-state]")!,
        )}
      </DndContext>
      <CalendarDropPreview controller={dropFeedback.controller} />
      {Object.entries(calendarDrafts)
        .filter(
          ([key, draft]) =>
            key.endsWith("/new") &&
            draft.dirty &&
            editing !== "new" &&
            !savingKeys.includes("calendar:" + key) &&
            scopes.some((scope) => scope.workspace.id === key.split("/")[0]),
        )
        .map(([key, draft]) => (
          <button
            type="button"
            key={key}
            disabled={savingKeys.includes("calendar:" + key)}
            className={button + " my-3"}
            onClick={() => {
              setDestination(key.split("/")[0]);
              setEditing("new");
            }}
          >
            Review new block draft: {draft.label}
          </button>
        ))}
      {reviewable.length > 0 && (
        <section
          aria-label="Retained block drafts"
          className="my-4 space-y-3 rounded border p-4"
        >
          <h2 className="font-semibold">Retained block drafts</h2>
          <p>
            These may be outside the visible range or already removed. Review
            the original input or reconcile an uncertain removal; they are not
            additional saved events.
          </p>
          {reviewable.map((draft) => (
            <button
              type="button"
              key={draft.base!.id}
              disabled={savingKeys.includes("calendar:" + draft.base!.id)}
              className={`${button} mr-2`}
              onClick={() => setEditing(draft.base!.id)}
            >
              Review draft: {draft.label}
            </button>
          ))}
        </section>
      )}
      {selected && (
        <BlockEditor
          key={selected.id}
          workspaceId={selected.workspaceId}
          zone={zone}
          day={day}
          record={selected}
          work={work.filter(
            (item) => item.workspaceId === selected.workspaceId,
          )}
          pickerFailed={
            scopes.find((scope) => scope.workspace.id === selected.workspaceId)
              ?.pickerFailed ?? true
          }
          onSaved={saved}
          lost={lost}
          close={() => setEditing(null)}
        />
      )}
      {editing === "new" && (
        <BlockEditor
          key={"new:" + destination}
          workspaceId={destination}
          zone={zone}
          day={day}
          work={work.filter((item) => item.workspaceId === destination)}
          pickerFailed={
            scopes.find((scope) => scope.workspace.id === destination)
              ?.pickerFailed ?? true
          }
          onSaved={(record) => {
            saved(record);
            setNotice(
              !("deleted" in record) && visibleIds.includes(record.workspaceId)
                ? "Saved time block."
                : "Saved outside Calendar scope. Use Advanced to change visibility.",
            );
          }}
          lost={lost}
          close={() => setEditing(null)}
          destinationControl={
            <label className="block">
              Destination workspace
              <select
                aria-label="Destination workspace"
                className={control}
                value={destination}
                disabled={
                  !!calendarDrafts[destination + "/blocks/new"]?.dirty ||
                  savingKeys.includes("calendar:" + destination + "/blocks/new")
                }
                onChange={(event) => setDestination(event.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      )}
    </div>
  );
}
function Palette({ item, open }: { item: Work; open: () => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: item.kind + ":" + item.id,
  });
  return (
    <div
      className="my-2 min-w-0 rounded border p-2"
      style={{
        backgroundColor: themedTint(
          projectColor(
            item.kind === "project"
              ? item.id
              : (item.record as TaskRecord).projectId,
          ),
        ),
      }}
    >
      <button
        ref={setNodeRef}
        data-drag-activator
        onClick={open}
        {...listeners}
        {...attributes}
        aria-label={"Edit " + item.kind + ": " + item.title}
        className={
          button + " planner-drag-activator w-full break-words text-left"
        }
        style={{ opacity: isDragging ? 0.4 : 1 }}
      >
        {item.title} · {item.context}
        {item.kind === "task" && (
          <TaskLabelBadges task={item.record as TaskRecord} />
        )}
      </button>
    </div>
  );
}
function BlockTarget({
  block,
  title,
  surface,
  zone,
}: {
  block: BlockRecord;
  title: string;
  surface: string;
  zone: string;
}) {
  const { setNodeRef } = useDroppable({
    id: surface + ":" + block.id,
    data: { blockId: block.id },
  });
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    node.current
      ?.closest(".fc-event")
      ?.setAttribute("aria-label", "Edit block: " + block.label);
  }, [block.label]);
  return (
    <div
      ref={(element) => {
        node.current = element;
        setNodeRef(element);
      }}
      data-block-id={block.id}
      id={`calendar-block-${surface}-${block.id}`}
      className="h-full min-h-0 overflow-hidden font-semibold"
      aria-label={
        eventText(
          block.label,
          `${block.workInTrash ? "Work in Trash · " : ""}${block.project?.title ?? block.task?.title ?? "Empty block"}`,
          block.startAt,
          block.endAt,
          zone,
        ).accessible
      }
      title={title}
    >
      <CalendarEventLabel
        title={block.label}
        work={`${block.workInTrash ? "Work in Trash · " : ""}${block.project?.title ?? block.task?.title ?? "Empty block"}`}
        start={block.startAt}
        end={block.endAt}
        zone={zone}
        projectId={blockProjectId(block)}
      />
    </div>
  );
}
