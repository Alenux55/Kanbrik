"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DndContext, MouseSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts } from "./planning-drafts";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import { taskStatusIds, taskStatusLabels, type TaskStatus } from "@/lib/task-statuses";

const button = "min-h-12 rounded-lg border border-neutral-400 px-3 py-2 disabled:opacity-50";
type Preferences = { workspaces: WorkspaceSummary[]; workspaceIds: string[] };
const same = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

export function Board() {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    session.fetch("/api/board/preferences").then(async response => {
      if (!response.ok) throw new Error();
      const result: Preferences = await response.json();
      if (active && session.isCurrent(lease)) { setPrefs(result); setDraft(result.workspaceIds); }
    }).catch(() => { if (active && session.isCurrent(lease)) setError("Could not load board selection. Retry loading the board."); });
    return () => { active = false; };
  }, [session, lease, epoch]);
  async function apply() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const response = await session.fetch("/api/board/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceIds: draft }) });
      if (!response.ok) throw new Error();
      const result: { workspaceIds: string[] } = await response.json();
      if (session.isCurrent(lease)) { setDraft(result.workspaceIds); setPrefs(current => current && ({ ...current, workspaceIds: result.workspaceIds })); }
    } catch { if (session.isCurrent(lease)) setError("Selection not saved. Your selection is kept; retry or reload accessible workspaces."); }
    finally { if (session.isCurrent(lease)) { busy.current = false; setPending(false); } }
  }
  function revoked(id: string) {
    setPrefs(current => current && ({ workspaces: current.workspaces.filter(item => item.id !== id), workspaceIds: current.workspaceIds.filter(value => value !== id) }));
    setDraft(current => current.filter(value => value !== id));
    setError("Workspace access ended. Its cards and selection were removed. Refresh board to check current access.");
  }
  const dirty = !!prefs && !same(draft, prefs.workspaceIds);
  return <section>
    <h1 className="text-4xl font-semibold">Board</h1>
    <p className="mt-4 leading-7 text-neutral-600">Shared tasks, five statuses. Only Done means completed. Saves require a connection.</p>
    {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
    <button className={`${button} mt-4`} disabled={pending} onClick={() => { setPrefs(null); setDraft([]); setError(""); setEpoch(value => value + 1); }}>Refresh board</button>
    {!prefs ? <p role="status" className="mt-5">{error ? "Board selection unavailable." : "Loading board…"}</p> : <>
      <fieldset disabled={pending} className="mt-6 rounded-xl border border-neutral-300 p-4">
        <legend className="font-semibold">Board workspaces</legend>
        <div className="flex flex-wrap gap-3">{prefs.workspaces.map(workspace => <label key={workspace.id} className="flex min-h-12 max-w-full items-center gap-2"><input type="checkbox" checked={draft.includes(workspace.id)} onChange={event => setDraft(current => event.target.checked ? [...current, workspace.id] : current.filter(id => id !== workspace.id))} /><span className="min-w-0 break-words">{workspace.name} ({workspace.kind})</span></label>)}</div>
        <div className="mt-3 flex flex-wrap gap-3"><button className={button} onClick={() => void apply()} disabled={!dirty || pending}>{pending ? "Saving selection…" : "Apply selection"}</button><button className={button} onClick={() => setDraft([])}>Clear selection</button></div>
      </fieldset>
      {dirty || pending ? <p role="status" className="mt-5">Unsaved selection. Apply it to load the board. Any drag has been canceled.</p> : <>
        <p className="mt-4 break-words text-sm">Active workspaces ({prefs.workspaceIds.length}): {prefs.workspaces.filter(item => prefs.workspaceIds.includes(item.id)).map(item => item.name).join(", ") || "None"}</p>
        {prefs.workspaceIds.length === 0 ? <p className="mt-6">No workspaces selected. Choose workspaces and apply your selection.</p> : <SelectedBoard key={`${epoch}:${prefs.workspaceIds.join(",")}`} workspaces={prefs.workspaces.filter(item => prefs.workspaceIds.includes(item.id))} onRevoked={revoked} />}
      </>}
    </>}
  </section>;
}

type Scope = { workspace: WorkspaceSummary; tasks: TaskRecord[]; projects: ProjectRecord[]; failed: boolean };
type Issue = { error: string; current?: TaskRecord };
function SelectedBoard({ workspaces, onRevoked }: { workspaces: WorkspaceSummary[]; onRevoked: (id: string) => void }) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const [scopes, setScopes] = useState<Scope[] | null>(null);
  const { savingKeys, beginSave, finishSave, saveEpoch } = usePlanningDrafts();
  const [issues, setIssues] = useState<Record<string, Issue>>({});
  const [message, setMessage] = useState("");
  const [activeStatus, setActiveStatus] = useState<TaskStatus>("todo");
  const alive = useRef(true);
  const generation = useRef(0);
  const focusTask = useRef<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));
  useEffect(() => {
    alive.current = true;
    const version = ++generation.current;
    Promise.all(workspaces.map(async workspace => {
      try {
        const responses = await Promise.all([session.fetch(`/api/workspaces/${workspace.id}/tasks`), session.fetch(`/api/workspaces/${workspace.id}/projects`)]);
        if (responses.some(response => response.status === 404)) {
          if (alive.current && version === generation.current && session.isCurrent(lease)) onRevoked(workspace.id);
          return null;
        }
        if (responses.some(response => !response.ok)) throw new Error();
        return { workspace, tasks: await responses[0].json() as TaskRecord[], projects: await responses[1].json() as ProjectRecord[], failed: false };
      } catch { return { workspace, tasks: [], projects: [], failed: true }; }
    })).then(result => { if (alive.current && version === generation.current && session.isCurrent(lease)) setScopes(result.filter((item): item is Scope => item !== null)); });
    return () => { alive.current = false; };
    // Selection is immutable for this mounted scope. Changing it remounts/cancels drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, saveEpoch]);
  useEffect(() => {
    if (focusTask.current) { document.getElementById(`board-status-${focusTask.current}`)?.focus(); focusTask.current = null; }
  }, [scopes]);
  function replace(task: TaskRecord) {
    setScopes(current => current?.map(scope => ({ ...scope, tasks: scope.tasks.map(item => item.id === task.id ? task : item) })) ?? null);
  }
  async function move(task: TaskRecord, status: TaskStatus) {
    const key = `board:${task.id}`;
    if (task.status === status || issues[task.id] || !beginSave(key)) return;
    let saved = false;
    setMessage("");
    try {
      const response = await session.fetch(`/api/workspaces/${task.workspaceId}/tasks/${task.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, revision: task.revision }) });
      const result = await response.json();
      saved = response.ok;
      if (!alive.current || !session.isCurrent(lease)) return;
      if (response.status === 404) { onRevoked(task.workspaceId); return; }
      if (response.status === 409) { setIssues(current => ({ ...current, [task.id]: { error: "Move conflicted. Review the saved version before another intentional move.", current: result.current } })); return; }
      if (!response.ok) throw new Error();
      focusTask.current = task.id; setActiveStatus(status); replace(result); setMessage(`Saved ${task.title}: ${taskStatusLabels[status]}.`);
    } catch {
      if (alive.current && session.isCurrent(lease)) setIssues(current => ({ ...current, [task.id]: { error: "Move not confirmed. The card stays at its saved status. Retry explicitly." } }));
    } finally { finishSave(key, saved); }
  }
  if (!scopes) return <p role="status" className="mt-6">Loading tasks…</p>;
  const tasks = scopes.flatMap(scope => scope.tasks).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const incomplete = scopes.some(scope => scope.failed);
  return <div className="mt-6">
    {incomplete && <p role="alert" className="mb-4 text-red-800">Board incomplete: {scopes.filter(scope => scope.failed).map(scope => scope.workspace.name).join(", ")} could not load. Counts below cover loaded workspaces only. Use Refresh board to retry.</p>}
    <p className="mb-4 text-sm">{incomplete ? "Loaded" : "Total"} tasks: {tasks.length}. Creation order; no manual ordering. Refresh board to fetch other people’s changes.</p>
    <p role="status" className="mb-3 break-words text-teal-900">{message}</p>
    <div className="mb-4 flex flex-wrap gap-2 lg:hidden" aria-label="Status columns">{taskStatusIds.map(status => <button key={status} className={button} aria-pressed={activeStatus === status} onClick={() => setActiveStatus(status)}>{taskStatusLabels[status]} ({tasks.filter(task => task.status === status).length})</button>)}</div>
    <DndContext sensors={sensors} accessibility={{ screenReaderInstructions: { draggable: "Use the labeled Status control to move tasks with keyboard or touch. Mouse users can drag the handle." } }} onDragEnd={({ active, over }) => {
      const task = tasks.find(item => item.id === active.id);
      if (task && over && taskStatusIds.includes(over.id as TaskStatus)) void move(task, over.id as TaskStatus);
    }}>
      <div className="grid min-w-0 gap-3 lg:grid-cols-5">{taskStatusIds.map(status => <Column key={status} status={status} active={status === activeStatus} count={tasks.filter(task => task.status === status).length}>
        {tasks.filter(task => task.status === status).map(task => {
          const scope = scopes.find(item => item.workspace.id === task.workspaceId)!;
          return <Card key={task.id} task={task} workspace={scope.workspace.name} project={scope.projects.find(item => item.id === task.projectId)?.title ?? "Standalone"} parent={scope.tasks.find(item => item.id === task.parentId)?.title} pending={savingKeys.includes(`board:${task.id}`)} issue={issues[task.id]} move={status => void move(task, status)} review={() => { const issue = issues[task.id]; if (issue.current) replace(issue.current); setIssues(current => { const next = { ...current }; delete next[task.id]; return next; }); }} />;
        })}
      </Column>)}</div>
    </DndContext>
  </div>;
}

function Column({ status, active, count, children }: { status: TaskStatus; active: boolean; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return <section ref={setNodeRef} aria-label={`${taskStatusLabels[status]} column`} className={`${active ? "block" : "hidden lg:block"} min-h-40 min-w-0 rounded-xl border p-2 ${isOver ? "border-teal-800 bg-teal-50" : "border-neutral-300 bg-neutral-100"}`}>
    <h2 className="mb-3 break-words font-semibold">{taskStatusLabels[status]} ({count})</h2>{children}
  </section>;
}
function Card({ task, workspace, project, parent, pending, issue, move, review }: { task: TaskRecord; workspace: string; project: string; parent?: string; pending: boolean; issue?: Issue; move: (status: TaskStatus) => void; review: () => void }) {
  const { setNodeRef, listeners, attributes, transform } = useDraggable({ id: task.id, disabled: pending || !!issue });
  return <article ref={setNodeRef} aria-label={task.title} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10, position: "relative" } : undefined} className="mb-3 min-w-0 space-y-2 rounded-lg border border-neutral-300 bg-white p-3 shadow-sm">
    <h3 className="break-words font-semibold">{task.title}</h3>
    <p className="break-words text-xs">{workspace} · {project}</p>
    {parent && <p className="break-words text-xs">Subtask of {parent}</p>}
    <p className="text-sm">{taskStatusLabels[task.status]}</p>
    <button {...attributes} {...listeners} tabIndex={-1} disabled={pending || !!issue} aria-label={`Drag ${task.title}`} className="hidden min-h-10 w-full cursor-grab rounded border border-neutral-300 text-sm lg:block">Drag handle</button>
    <label className="block break-words text-sm">Status for {task.title}<select id={`board-status-${task.id}`} aria-label={`Status for ${task.title}`} className="mt-1 min-h-12 w-full min-w-0 rounded border border-neutral-400 bg-white" value={task.status} disabled={pending || !!issue} onChange={event => move(event.target.value as TaskStatus)}>{taskStatusIds.map(status => <option value={status} key={status}>{taskStatusLabels[status]}</option>)}</select></label>
    {pending && <p role="status">Saving move…</p>}
    {issue && <div role="alert" className="space-y-2 break-words text-sm text-red-800"><p>{issue.error}</p>{issue.current && <p>Saved: {issue.current.title} · {taskStatusLabels[issue.current.status]} · revision {issue.current.revision}. {issue.current.description}</p>}<button className={button} onClick={review}>{issue.current ? "Review saved version" : "Allow retry"}</button></div>}
    <details><summary className="flex min-h-12 cursor-pointer items-center text-sm underline">Task details</summary><p className="whitespace-pre-wrap break-words text-sm">{task.description || "No description"}</p><Link href="/projects" className="inline-flex min-h-12 items-center text-sm underline">Edit in Projects</Link></details>
  </article>;
}
