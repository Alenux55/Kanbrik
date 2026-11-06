"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import { taskStatusIds, taskStatusLabels } from "@/lib/task-statuses";
import { usePlanningDrafts, type PlanningDraft } from "./planning-drafts";

const control = "mt-2 block min-h-12 w-full rounded-lg border border-neutral-400 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-700";
const button = "min-h-12 rounded-lg border border-neutral-400 px-4 py-2 disabled:opacity-60";
const primary = `${button} bg-teal-900 text-white`;
const box = "mt-6 min-w-0 space-y-4 rounded-xl border border-neutral-200 bg-white p-5";
type Saved = ProjectRecord | TaskRecord;
type PlanningData = { projects: ProjectRecord[]; tasks: TaskRecord[] };

export function ProjectsPlanner({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const { workspaceId, setWorkspaceId } = usePlanningDrafts();
  const workspace = workspaces.find(item => item.id === workspaceId);
  return <section>
    <h1 className="text-4xl font-semibold">Projects</h1>
    <p className="mt-4 leading-7 text-neutral-600">Plan projects and tasks in one workspace. Saves require a connection.</p>
    <label className="mt-6 block font-medium">Planning workspace<select className={control} value={workspace?.id ?? ""} onChange={event => setWorkspaceId(event.target.value)}>
      <option value="">Choose a workspace</option>
      {workspaces.map(item => <option value={item.id} key={item.id}>{item.name} ({item.kind})</option>)}
    </select></label>
    <p className="mt-3 text-sm text-neutral-600">Unsaved drafts stay with their original workspace during navigation in this signed-in session. Refreshing or closing this page loses drafts.</p>
    {workspace ? <WorkspacePlanning key={workspace.id} workspace={workspace} /> : <p className="mt-8">Choose a workspace to view its projects and standalone tasks.</p>}
  </section>;
}

function WorkspacePlanning({ workspace }: { workspace: WorkspaceSummary }) {
  const [data, setData] = useState<PlanningData | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [lost, setLost] = useState(false);
  const [pending, setPending] = useState(false);
  const { setDrafts, saveEpoch } = usePlanningDrafts();
  const path = `/api/workspaces/${encodeURIComponent(workspace.id)}`;
  const refreshSequence = useRef(0);
  const refreshBusy = useRef(false);
  function accessEnded() {
    setLost(true); setData(null); setError("Your access has ended or this content is unavailable. Choose another workspace or sign in again.");
    setDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${workspace.id}/`))));
  }
  useEffect(() => {
    let active = true;
    const sequence = ++refreshSequence.current;
    Promise.all([fetch(`${path}/projects`, { cache: "no-store" }), fetch(`${path}/tasks`, { cache: "no-store" })]).then(async responses => {
      if (!active || sequence !== refreshSequence.current) return;
      if (responses.some(response => response.status === 401 || response.status === 404)) { accessEnded(); return; }
      if (responses.some(response => !response.ok)) throw new Error();
      const [projects, tasks] = await Promise.all(responses.map(response => response.json()));
      if (active && sequence === refreshSequence.current) setData({ projects, tasks });
    }).catch(() => { if (active && sequence === refreshSequence.current) setError("Could not load planning. Try Refresh planning."); });
    return () => { active = false; };
    // A new component is mounted for each workspace; drafts live above it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, saveEpoch]);
  async function refresh() {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    const sequence = ++refreshSequence.current;
    setPending(true); setError("");
    try {
      const responses = await Promise.all([fetch(`${path}/projects`, { cache: "no-store" }), fetch(`${path}/tasks`, { cache: "no-store" })]);
      if (sequence !== refreshSequence.current) return;
      if (responses.some(response => response.status === 401 || response.status === 404)) { accessEnded(); return; }
      if (responses.some(response => !response.ok)) throw new Error();
      const [projects, tasks] = await Promise.all(responses.map(response => response.json()));
      if (sequence === refreshSequence.current) setData({ projects, tasks });
    } catch { if (sequence === refreshSequence.current) setError("Could not refresh planning. Drafts have been kept; try again."); }
    finally { refreshBusy.current = false; setPending(false); }
  }
  function saved(kind: "projects" | "tasks", record: Saved) {
    setData(current => current && ({ ...current, [kind]: [...current[kind].filter(item => item.id !== record.id), record].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) }));
  }
  const project = data?.projects.find(item => item.id === projectId);
  const tasks = data?.tasks.filter(item => item.projectId === (project?.id ?? null)) ?? [];
  const task = tasks.find(item => item.id === taskId);
  return <div className="mt-8">
    <h2 className="break-words text-2xl font-semibold">{workspace.name}</h2>
    <p className="mt-2 capitalize">{workspace.kind} workspace</p>
    <button className={`${button} mt-4`} disabled={pending} onClick={() => void refresh()}>{pending ? "Refreshing…" : "Refresh planning"}</button>
    {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
    {lost ? <h3 className="mt-6 text-xl font-semibold">Workspace unavailable</h3> : !data ? <p className="mt-5" role="status">{error ? "Planning not loaded." : "Loading planning…"}</p> : <>
      <nav aria-label="Project selection" className="mt-6 flex flex-wrap gap-3">
        <button className={button} aria-pressed={!project} onClick={() => { setProjectId(null); setTaskId(null); }}>Standalone tasks / all projects</button>
        {data.projects.map(item => <button className={`${button} max-w-full break-words text-left`} aria-pressed={projectId === item.id} key={item.id} onClick={() => { setProjectId(item.id); setTaskId(null); }}>Open project: {item.title}</button>)}
      </nav>
      {project ? <section aria-label="Project details">
        <PlanningForm key={project.id} kind="projects" workspaceId={workspace.id} record={project} heading="Edit project" onSaved={record => saved("projects", record)} onUnavailable={accessEnded} />
      </section> : <PlanningForm kind="projects" workspaceId={workspace.id} heading="Create project" onSaved={record => saved("projects", record)} onUnavailable={accessEnded} />}
      <section className="mt-8" aria-label="Tasks">
        <h3 className="break-words text-2xl font-semibold">{project ? `Tasks in ${project.title}` : "Standalone tasks"}</h3>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Parent and subtask statuses are independent. Only Done means completed.</p>
        {tasks.length === 0 && <p className="mt-4">No tasks yet.</p>}
        <ul className="mt-4 space-y-4">
          {tasks.filter(item => !item.parentId).map(parent => <li className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4" key={parent.id}>
            <TaskRow task={parent} open={() => setTaskId(parent.id)} />
            <ul className="ml-3 mt-3 space-y-3 border-l-2 border-teal-200 pl-3">
              {tasks.filter(child => child.parentId === parent.id).map(child => <li key={child.id}><TaskRow task={child} open={() => setTaskId(child.id)} child /></li>)}
            </ul>
          </li>)}
        </ul>
        {task && <div>
          <PlanningForm key={task.id} kind="tasks" workspaceId={workspace.id} record={task} heading={task.parentId ? "Edit subtask" : "Edit task"} onSaved={record => saved("tasks", record)} onUnavailable={accessEnded} />
          {!task.parentId && <PlanningForm key={`child-${task.id}`} kind="tasks" workspaceId={workspace.id} parentId={task.id} projectId={task.projectId} heading="Create subtask" onSaved={record => saved("tasks", record)} onUnavailable={accessEnded} />}
        </div>}
        <PlanningForm key={`new-${project?.id ?? "standalone"}`} kind="tasks" workspaceId={workspace.id} projectId={project?.id ?? null} heading="Create task" onSaved={record => saved("tasks", record)} onUnavailable={accessEnded} />
      </section>
    </>}
  </div>;
}

function TaskRow({ task, open, child = false }: { task: TaskRecord; open: () => void; child?: boolean }) {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
    <div className="min-w-0"><p className="break-words font-medium">{child && <span className="text-sm text-neutral-600">Subtask: </span>}{task.title}</p><p className="mt-1 text-sm">{taskStatusLabels[task.status]}</p></div>
    <button className={button} onClick={open} aria-label={`Edit ${child ? "subtask" : "task"}: ${task.title}`}>Edit{!child && " / add subtask"}</button>
  </div>;
}

function PlanningForm({ kind, workspaceId, record, projectId, parentId, heading, onSaved, onUnavailable }: {
  kind: "projects" | "tasks"; workspaceId: string; record?: Saved; projectId?: string | null; parentId?: string;
  heading: string; onSaved: (record: Saved) => void; onUnavailable: () => void;
}) {
  const { drafts, setDrafts, savingKeys, beginSave, finishSave } = usePlanningDrafts();
  const key = `${workspaceId}/${kind}/${record?.id ?? `new-${projectId ?? "standalone"}-${parentId ?? "root"}`}`;
  const initial: PlanningDraft = { title: record?.title ?? "", description: record?.description ?? "", status: record && "status" in record ? record.status : "todo", revision: record?.revision ?? 1, dirty: false };
  const draft = drafts[key] ?? initial;
  const pending = savingKeys.includes(key);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<Saved | null>(null);
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  function change(values: Partial<PlanningDraft>) {
    setDrafts(current => ({ ...current, [key]: { ...(current[key] ?? initial), ...values, dirty: true } }));
    setMessage("");
  }
  function discard() {
    setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
    setError(""); setMessage(""); setConflict(null);
    titleRef.current?.focus();
  }
  async function submit() {
    if (conflict || !beginSave(key)) return;
    let saved = false;
    setError(""); setMessage("");
    try {
      const payload = { title: draft.title, description: draft.description, ...(kind === "tasks" ? { status: draft.status } : {}), ...(record ? { revision: draft.revision } : kind === "tasks" ? { projectId, parentId } : {}) };
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/${kind}${record ? `/${encodeURIComponent(record.id)}` : ""}`, { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 401 || response.status === 404) { onUnavailable(); return; }
      const result = await response.json();
      if (response.status === 409) { setConflict(result.current); throw new Error(result.error); }
      if (!response.ok) throw new Error(result.error ?? "Save not confirmed. Your draft is kept for retry.");
      saved = true; onSaved(result); discard(); setMessage("Saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Save not confirmed. Your draft is kept for retry."); }
    finally { finishSave(key, saved); }
  }
  return <form aria-label={heading} className={box} aria-busy={pending} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3 className="text-xl font-semibold">{heading}</h3>
    {draft.dirty && <p className="text-sm font-medium text-amber-900">Unsaved draft</p>}
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <label className="block" htmlFor={`${formId}-title`}>Title<input id={`${formId}-title`} ref={titleRef} className={control} required maxLength={200} value={draft.title} onChange={event => change({ title: event.target.value })} /></label>
      <label className="block" htmlFor={`${formId}-description`}>Description<textarea id={`${formId}-description`} className={`${control} min-h-28`} maxLength={20_000} value={draft.description} onChange={event => change({ description: event.target.value })} /></label>
      {kind === "tasks" && <label className="block" htmlFor={`${formId}-status`}>Status<select id={`${formId}-status`} className={control} value={draft.status} onChange={event => change({ status: event.target.value as PlanningDraft["status"] })}>{taskStatusIds.map(status => <option value={status} key={status}>{taskStatusLabels[status]}</option>)}</select></label>}
      <div className="flex flex-wrap gap-3"><button className={primary} disabled={pending || !!conflict}>{pending ? "Saving…" : record ? "Save changes" : heading}</button>
        {draft.dirty && <button type="button" className={button} onClick={discard}>Discard draft</button>}
      </div>
    </fieldset>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {message && <p role="status" className="text-teal-900">{message}</p>}
    {conflict && <section aria-label="Saved version" className="space-y-3 border-t border-amber-300 pt-4">
      <h4 className="font-semibold">Saved version (revision {conflict.revision})</h4>
      <p className="break-words font-medium">{conflict.title}</p><p className="whitespace-pre-wrap break-words">{conflict.description || "No description"}</p>
      {"status" in conflict && <p>{taskStatusLabels[conflict.status]}</p>}
      <p className="text-sm">Compare this with your draft above. Keeping your draft uses this revision for your next explicit save.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => { onSaved(conflict); discard(); }}>Load saved version</button>
        <button type="button" className={button} onClick={() => { change({ revision: conflict.revision }); setConflict(null); setError(""); }}>Review complete: keep my draft</button>
      </div>
    </section>}
  </form>;
}
