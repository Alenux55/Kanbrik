"use client";
import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGrid from "@fullcalendar/timegrid";
import interaction from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import { DateTime } from "luxon";
import { DndContext, MouseSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts } from "./planning-drafts";
import { calendarRange, validZone, wallOptions } from "@/lib/calendar-time";
import { blockDraft, type CalendarDraft } from "@/lib/calendar-draft";
import type { BlockRecord } from "@/lib/calendar-contracts";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import type { WorkspaceSummary } from "@/lib/workspace-contracts";
import type { z } from "zod";
import type { editBlockInput } from "@/lib/calendar-contracts";
type BlockChanges = z.infer<typeof editBlockInput>["changes"];
const button = "min-h-12 min-w-0 max-w-full rounded-lg border border-neutral-400 px-3 py-2 [overflow-wrap:anywhere] disabled:opacity-50";
const control = "mt-1 block min-h-12 w-full min-w-0 rounded border border-neutral-400 bg-white px-3";
type Pref = { workspaces: WorkspaceSummary[]; workspaceIds: string[]; timeZone: string | null };
type Work = { id: string; workspaceId: string; kind: "project" | "task"; title: string; context: string };
type Scope = { workspace: WorkspaceSummary; blocks: BlockRecord[]; work: Work[]; failed: boolean; pickerFailed: boolean };
const display = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat("ccc dd LLL HH:mm ZZ");
export function CalendarPlanner() {
  const session = usePlannerSession(); const [lease] = useState(session.capture);
  const [prefs, setPrefs] = useState<Pref | null>(null); const [ids, setIds] = useState<string[]>([]); const [zone, setZone] = useState("UTC");
  const [displayZone, setDisplayZone] = useState("UTC");
  const [day, setDay] = useState(""); const [view, setView] = useState("day"); const initialized = useRef(false);
  const [preferenceRetry, setPreferenceRetry] = useState(0);
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const [editing, setEditing] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    session.fetch("/api/calendar/preferences").then(async response => {
      if (!response.ok) throw new Error(); const result: Pref = await response.json();
      if (!active || !session.isCurrent(lease)) return;
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const initial = result.timeZone ?? (validZone(detected) ? detected : "UTC");
      setPrefs(result); setIds(result.workspaceIds); setZone(initial); setDisplayZone(initial); setDay(current => current || DateTime.now().setZone(initial).toISODate()!);
      if (!initialized.current && window.matchMedia("(min-width: 1024px)").matches) setView("week");
      initialized.current = true;
    }).catch(() => { if (active && session.isCurrent(lease)) setError("Calendar preferences unavailable. Retry Refresh calendar."); });
    return () => { active = false; };
  }, [session, lease, preferenceRetry]);
  async function apply() {
    if (busy.current) return; busy.current = true; setPending(true); setError("");
    try {
      const response = await session.fetch("/api/calendar/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceIds: ids, timeZone: zone }) });
      if (!response.ok) throw new Error(); const saved = await response.json();
      if (session.isCurrent(lease)) { setPrefs(current => current && ({ ...current, ...saved })); setDisplayZone(saved.timeZone); setEditing(null); }
    } catch { if (session.isCurrent(lease)) setError("Preferences not saved. Input is kept; retry."); }
    finally { if (session.isCurrent(lease)) { busy.current = false; setPending(false); } }
  }
  function revoked(id: string) {
    setPrefs(current => current && ({ ...current, workspaces: current.workspaces.filter(item => item.id !== id), workspaceIds: current.workspaceIds.filter(value => value !== id) }));
    setIds(current => current.filter(value => value !== id)); setEditing(null); setError("Workspace access ended. Its calendar content and drafts were removed.");
  }
  const activeZone = displayZone;
  const dirty = prefs && (ids.length !== prefs.workspaceIds.length || ids.some(id => !prefs.workspaceIds.includes(id)) || zone !== displayZone);
  const range = day && validZone(activeZone) ? calendarRange(day, activeZone, view === "week") : null;
  return <section className="min-w-0 [overflow-wrap:anywhere]"><h1 className="text-4xl font-semibold">Calendar</h1><p className="mt-3">Time blocks reference work; scheduling never changes task status. Saves require a connection.</p>
    {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
    <button className={`${button} mt-4`} onClick={() => { if (dirty || pending) { setError("Apply calendar preferences before refreshing; input is kept."); return; } setError(""); setPrefs(null); setPreferenceRetry(value => value + 1); }}>Refresh calendar</button>
    {!prefs ? <p role="status">Loading preferences…</p> : <>
      <fieldset disabled={pending} className="my-5 space-y-3 rounded border p-4"><legend>Calendar preferences (independent of Board)</legend>
        <div className="flex flex-wrap gap-3">{prefs.workspaces.map(workspace => <label className="flex min-h-12 min-w-0 items-center gap-2" key={workspace.id}><input type="checkbox" checked={ids.includes(workspace.id)} onChange={event => setIds(current => event.target.checked ? [...current, workspace.id] : current.filter(id => id !== workspace.id))} /><span className="break-words">{workspace.name} ({workspace.kind})</span></label>)}</div>
        <label className="block">Display time zone<input className={control} value={zone} onChange={event => setZone(event.target.value)} /></label>
        <p className="text-sm">{prefs.timeZone ? "Saved zone" : "Initial browser zone (UTC fallback), not saved yet"}. Editing forms retain their own zone.</p>
        <button className={button} onClick={() => void apply()} disabled={pending || !validZone(zone)}>{pending ? "Saving…" : "Apply calendar preferences"}</button> <button className={button} onClick={() => setIds([])}>Clear calendar selection</button>
      </fieldset>
      {dirty || pending ? <p role="status">Unsaved preferences. Apply them to display the calendar. Any gesture is canceled.</p> : <>
        <div className="flex flex-wrap items-end gap-3"><label>Date<input type="date" className={control} value={day} onChange={event => { if (event.target.value) { setDay(event.target.value); setEditing(null); } }} /></label>
          <button className={button} onClick={() => { setDay(DateTime.fromISO(day).minus(view === "week" ? { weeks: 1 } : { days: 1 }).toISODate()!); setEditing(null); }}>Previous</button><button className={button} onClick={() => { setDay(DateTime.now().setZone(activeZone).toISODate()!); setEditing(null); }}>Today</button><button className={button} onClick={() => { setDay(DateTime.fromISO(day).plus(view === "week" ? { weeks: 1 } : { days: 1 }).toISODate()!); setEditing(null); }}>Next</button>
          <label>View<select aria-label="View" className={control} value={view} onChange={event => { setView(event.target.value); setEditing(null); }}><option value="week">Week grid</option><option value="day">Day / agenda</option></select></label></div>
        <p className="my-4 break-words">Display zone: {activeZone}. Selected: {prefs.workspaces.filter(item => prefs.workspaceIds.includes(item.id)).map(item => item.name).join(", ") || "None"}. Range: {range && `${display(range.start, activeZone)} – ${display(range.end, activeZone)}`}</p>
        {prefs.workspaceIds.length && range ? <CalendarScope key={`${preferenceRetry}:${prefs.workspaceIds.join(",")}:${activeZone}:${day}:${view}`} workspaces={prefs.workspaces.filter(item => prefs.workspaceIds.includes(item.id))} zone={activeZone} day={day} view={view} range={range} editing={editing} setEditing={setEditing} revoked={revoked} /> : <p>No calendar workspaces selected. Select a destination above before creating a block.</p>}
      </>}
    </>}
  </section>;
}

function CalendarScope({ workspaces, zone, day, view, range, editing, setEditing, revoked }: { workspaces: WorkspaceSummary[]; zone: string; day: string; view: string; range: { start: string; end: string }; editing: string | null; setEditing: (id: string | null) => void; revoked: (id: string) => void }) {
  const session = usePlannerSession(); const [lease] = useState(session.capture);
  const store = usePlanningDrafts(); const { saveEpoch, beginSave, finishSave, savingKeys, setCalendarDrafts, calendarDrafts } = store;
  const [scopes, setScopes] = useState<Scope[] | null>(null); const [destination, setDestination] = useState(workspaces[0].id);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true); const version = useRef(0); const canceledGesture = useRef(false);
  useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") canceledGesture.current = true; }; document.addEventListener("keydown", cancel); return () => document.removeEventListener("keydown", cancel); }, []);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));
  function lost(id: string) { setCalendarDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}/`)))); revoked(id); }
  useEffect(() => {
    alive.current = true; const seq = ++version.current;
    Promise.all(workspaces.map(async workspace => {
      try {
        const path = `/api/workspaces/${workspace.id}`;
        const [events, tasks, projects] = await Promise.all([session.fetch(`${path}/time-blocks?${new URLSearchParams(range)}`), session.fetch(`${path}/tasks`), session.fetch(`${path}/projects`)]);
        if ([events, tasks, projects].some(response => response.status === 404)) { if (alive.current && seq === version.current && session.isCurrent(lease)) lost(workspace.id); return null; }
        if (!events.ok) throw new Error();
        const pickerFailed = !tasks.ok || !projects.ok;
        const ts: TaskRecord[] = tasks.ok ? await tasks.json() : []; const ps: ProjectRecord[] = projects.ok ? await projects.json() : [];
        const work: Work[] = pickerFailed ? [] : [...ps.map(item => ({ id: item.id, workspaceId: workspace.id, kind: "project" as const, title: item.title, context: "Project" })), ...ts.map(item => ({ id: item.id, workspaceId: workspace.id, kind: "task" as const, title: item.title, context: `${item.status} · ${ps.find(p => p.id === item.projectId)?.title ?? "Standalone"}${item.parentId ? ` · Subtask of ${ts.find(t => t.id === item.parentId)?.title}` : ""}` }))];
        return { workspace, blocks: await events.json() as BlockRecord[], work, pickerFailed, failed: false };
      } catch { return { workspace, blocks: [], work: [], pickerFailed: true, failed: true }; }
    })).then(result => { if (alive.current && seq === version.current && session.isCurrent(lease)) setScopes(result.filter((item): item is Scope => item !== null)); });
    return () => { alive.current = false; };
    // Selection/range/zone are immutable for this mounted asynchronous context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, saveEpoch]);
  function saved(record: BlockRecord | { deleted: true; id: string }) {
    setScopes(current => current?.map(scope => ({ ...scope, blocks: "deleted" in record ? scope.blocks.filter(item => item.id !== record.id) : [...scope.blocks.filter(item => item.id !== record.id), ...(scope.workspace.id === record.workspaceId && Date.parse(record.startAt) < Date.parse(range.end) && Date.parse(record.endAt) > Date.parse(range.start) ? [record] : [])] })) ?? null);
    if ("deleted" in record) { setEditing(null); setNotice("Block removed. Referenced work is unchanged."); }
  }
  function retainGesture(block: BlockRecord, changes: BlockChanges, conflict?: BlockRecord, confirmOccurrences = false) {
    let proposed = blockDraft(block);
    if (changes.schedule) proposed = { ...proposed, ...blockDraft({ ...block, ...changes.schedule }), dirty: true };
    if (changes.assignment) proposed.assignment = changes.assignment.projectId ? `project:${changes.assignment.projectId}` : changes.assignment.taskId ? `task:${changes.assignment.taskId}` : "";
    proposed.base = block;
    if (confirmOccurrences) { proposed.startChoice = ""; proposed.endChoice = ""; }
    proposed.conflict = conflict;
    setCalendarDrafts(current => ({ ...current, [`${block.workspaceId}/blocks/${block.id}`]: proposed }));
    if (alive.current) setEditing(block.id);
  }
  async function gesture(block: BlockRecord, changes: BlockChanges) {
    if (!alive.current || !session.isCurrent(lease)) return;
    if (calendarDrafts[`${block.workspaceId}/blocks/${block.id}`]?.dirty) { setEditing(block.id); setError("This block has a retained draft. Review or discard it before a gesture."); return; }
    const key = `calendar:${block.id}`; if (!beginSave(key)) return; let committed = false;
    // Capture recoverable input before dispatch; it survives route/range changes.
    retainGesture(block, changes);
    try {
      const response = await session.fetch(`/api/workspaces/${block.workspaceId}/time-blocks/${block.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: block.revision, changes }) });
      const result = await response.json(); committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok) setCalendarDrafts(current => { const next = { ...current }; delete next[`${block.workspaceId}/blocks/${block.id}`]; return next; });
      if (!alive.current) return;
      if (response.status === 404) { lost(block.workspaceId); return; }
      if (!response.ok) { setError(response.status === 409 ? `Conflict. Saved revision ${result.current?.revision}; proposed change retained. Review saved block before retrying.` : "Save not confirmed. Proposed change retained; review and retry explicitly."); retainGesture(block, changes, result.current); return; }
      saved(result); setError(""); setNotice("Saved calendar change.");
    } catch { if (alive.current && session.isCurrent(lease)) setError("Save not confirmed. Proposed change retained in the editing form."); }
    finally { finishSave(key, committed); }
  }
  if (!scopes) return <p role="status">Loading calendar…</p>;
  const all = scopes.flatMap(scope => scope.blocks); const work = scopes.flatMap(scope => scope.work);
  const retained = Object.values(calendarDrafts).filter(draft => draft.base && scopes.some(scope => !scope.failed && scope.workspace.id === draft.base!.workspaceId));
  const selected = all.find(block => block.id === editing) ?? retained.find(draft => draft.base?.id === editing)?.base;
  const incomplete = scopes.some(scope => scope.failed);
  return <div className="min-w-0">
    {incomplete && <p role="alert">Calendar incomplete. Failed workspaces have no editable stale events; counts cover loaded scopes only. Refresh calendar to retry.</p>}
    {scopes.some(scope => scope.pickerFailed) && <p role="alert">Work picker incomplete. Assignment/create controls are unavailable for failed scopes; refresh to retry.</p>}
    {error && <p role="status" className="my-3 break-words text-red-800">{error}</p>}
    {notice && <p role="status" className="my-3 break-words text-teal-800">{notice}</p>}
    <p className="my-3">{incomplete ? "Loaded" : "Total"} blocks in range: {all.length}. Overlaps allowed; intervals end exclusively.</p>
    <DndContext sensors={sensors} onDragEnd={({ active, over }) => {
      const item = work.find(value => `${value.kind}:${value.id}` === active.id); const block = all.find(value => value.id === over?.data.current?.blockId);
      if (!item || !block) return;
      if (item.workspaceId !== block.workspaceId || block.projectId || block.taskId) { setError("No assignment saved. Use an empty block in the same workspace, or explicitly replace its assignment in the form."); return; }
      void gesture(block, { assignment: { projectId: item.kind === "project" ? item.id : null, taskId: item.kind === "task" ? item.id : null } });
    }}>
      <div className="lg:my-5 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-4"><div className="hidden max-h-[650px] overflow-auto rounded border p-3 lg:block" aria-label="Calendar work palette"><h2 className="font-semibold">Drag work onto an existing empty block below</h2>{scopes.map(scope => <div key={scope.workspace.id}><h3>{scope.workspace.name}</h3>{scope.work.map(item => <Palette key={`${item.kind}:${item.id}`} item={item} />)}</div>)}</div>
      <div className="hidden min-w-0 lg:block"><FullCalendar key={`${day}:${view}:${zone}`} plugins={[timeGrid, interaction, luxonPlugin]} initialView={view === "week" ? "timeGridWeek" : "timeGridDay"} initialDate={day} firstDay={1} timeZone={zone} headerToolbar={false} allDaySlot={false} height={650} slotMinTime="00:00:00" scrollTime="09:00:00" snapDuration="00:15:00" editable eventDragStart={() => { canceledGesture.current = false; }} eventResizeStart={() => { canceledGesture.current = false; }} eventDragMinDistance={8} eventDurationEditable eventResizableFromStart events={all.map(block => ({ id: block.id, title: block.label, start: block.startAt, end: block.endAt, editable: !savingKeys.includes(`calendar:${block.id}`) && !calendarDrafts[`${block.workspaceId}/blocks/${block.id}`]?.dirty }))} eventContent={info => { const block = all.find(value => value.id === info.event.id); if (!block) return null; return <BlockTarget block={block} surface="grid" title={`${info.timeText} ${block.label} · ${scopes.find(scope => scope.workspace.id === block.workspaceId)?.workspace.name} · ${block.project?.title ?? block.task?.title ?? "Empty block"}`} />; }} eventClick={info => setEditing(info.event.id)} eventDrop={info => {
        if (canceledGesture.current || !alive.current) { info.revert(); return; }
        const block = all.find(value => value.id === info.event.id); if (!block) { info.revert(); return; } const start = DateTime.fromJSDate(info.event.start!).setZone(zone); const end = start.plus({ milliseconds: Date.parse(block.endAt) - Date.parse(block.startAt) }); info.revert();
        if (start.toMillis() === Date.parse(block.startAt)) return;
        if (start.getPossibleOffsets().length > 1 || end.getPossibleOffsets().length > 1) { retainGesture(block, { schedule: { startAt: start.toISO()!, endAt: end.toISO()!, timeZone: zone } }, undefined, true); setError("Ambiguous pointer time. Confirm occurrences explicitly in the editing form."); return; }
        void gesture(block, { schedule: { startAt: start.toISO()!, endAt: end.toISO()!, timeZone: zone } });
      }} eventResize={info => {
        if (canceledGesture.current || !alive.current) { info.revert(); return; }
        const block = all.find(value => value.id === info.event.id); if (!block) { info.revert(); return; } const start = DateTime.fromJSDate(info.event.start!).setZone(zone), end = DateTime.fromJSDate(info.event.end!).setZone(zone); info.revert();
        if (start.toMillis() === Date.parse(block.startAt) && end.toMillis() === Date.parse(block.endAt)) return;
        if (start.getPossibleOffsets().length > 1 || end.getPossibleOffsets().length > 1) { retainGesture(block, { schedule: { startAt: start.toISO()!, endAt: end.toISO()!, timeZone: zone } }, undefined, true); setError("Ambiguous boundary. Confirm in the editing form."); return; }
        void gesture(block, { schedule: { startAt: start.toISO()!, endAt: end.toISO()!, timeZone: zone } });
      }} /></div></div>
      <h2 className="mt-6 text-xl font-semibold">Agenda and explicit controls</h2>
      {all.sort((a, b) => a.startAt.localeCompare(b.startAt)).map(block => <div key={block.id} className="my-3 min-w-0 rounded border bg-white p-4"><BlockTarget block={block} surface="agenda" title={block.label} /><p className="break-words">{display(block.startAt, zone)} – {display(block.endAt, zone)} · {(Date.parse(block.endAt) - Date.parse(block.startAt)) / 3600000} elapsed hours</p><p className="break-words">{scopes.find(scope => scope.workspace.id === block.workspaceId)?.workspace.name} · {block.project?.title ?? block.task?.title ?? "Empty block"} {block.task?.status ?? ""}</p><button className={button} onClick={() => setEditing(block.id)}>Edit block: {block.label}</button></div>)}
    </DndContext>
    {retained.length > 0 && <section aria-label="Retained block drafts" className="my-4 space-y-3 rounded border p-4"><h2 className="font-semibold">Retained block drafts</h2><p>These may be outside the visible range or already removed. Review the original input or reconcile an uncertain removal; they are not additional saved events.</p>{retained.map(draft => <button type="button" key={draft.base!.id} className={`${button} mr-2`} onClick={() => setEditing(draft.base!.id)}>Review draft: {draft.label}</button>)}</section>}
    {selected && <BlockForm key={selected.id} workspaceId={selected.workspaceId} zone={selected.timeZone} day={day} record={selected} work={work.filter(item => item.workspaceId === selected.workspaceId)} pickerFailed={scopes.find(scope => scope.workspace.id === selected.workspaceId)?.pickerFailed ?? true} onSaved={saved} lost={lost} />}
    <h2 className="mt-6 text-xl font-semibold">New block</h2><label className="block">Destination workspace<select aria-label="Destination workspace" className={control} value={destination} onChange={event => setDestination(event.target.value)}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
    <BlockForm key={`new:${destination}`} workspaceId={destination} zone={zone} day={day} work={work.filter(item => item.workspaceId === destination)} pickerFailed={scopes.find(scope => scope.workspace.id === destination)?.pickerFailed ?? true} onSaved={saved} lost={lost} />
  </div>;
}
function Palette({ item }: { item: Work }) {
  const { setNodeRef, listeners, attributes, transform } = useDraggable({ id: `${item.kind}:${item.id}` });
  return <button ref={setNodeRef} {...listeners} {...attributes} aria-label={`Drag ${item.kind}: ${item.title}`} className={`${button} m-1 max-w-full break-words text-left`} style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, position: "relative", zIndex: 50 } : undefined}>{item.title} · {item.context}</button>;
}
function BlockTarget({ block, title, surface }: { block: BlockRecord; title: string; surface: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${surface}:${block.id}`, data: { blockId: block.id } });
  return <div ref={setNodeRef} data-block-id={block.id} className={`min-h-10 break-words font-semibold ${isOver ? "bg-amber-200 text-black" : ""}`}>{title}</div>;
}

function BlockForm({ workspaceId, zone, day, record, work, pickerFailed, onSaved, lost }: { workspaceId: string; zone: string; day: string; record?: BlockRecord; work: Work[]; pickerFailed: boolean; onSaved: (record: BlockRecord | { deleted: true; id: string }) => void; lost: (id: string) => void }) {
  const session = usePlannerSession(); const [lease] = useState(session.capture); const { calendarDrafts, setCalendarDrafts, beginSave, finishSave, savingKeys } = usePlanningDrafts();
  const key = `${workspaceId}/blocks/${record?.id ?? "new"}`;
  function defaults(): CalendarDraft {
    if (record) return { ...blockDraft(record), dirty: false };
    return { label: "Time block", zone, start: `${day}T12:00`, end: `${day}T15:00`, startChoice: "", endChoice: "", assignment: "", revision: 1, requestKey: crypto.randomUUID(), dirty: false };
  }
  const [initial, setInitial] = useState(defaults); const draft = calendarDrafts[key] ?? (record ? defaults() : initial);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const conflict = draft.conflict; const [confirm, setConfirm] = useState(false);
  const pending = savingKeys.includes(`calendar:${record?.id ?? key}`);
  const startOptions = wallOptions(draft.start, draft.zone), endOptions = wallOptions(draft.end, draft.zone);
  const original = draft.base ? blockDraft(draft.base) : null;
  const startUnchanged = original && draft.zone === original.zone && draft.start === original.start && draft.startChoice === original.startChoice;
  const endUnchanged = original && draft.zone === original.zone && draft.end === original.end && draft.endChoice === original.endChoice;
  const start = startUnchanged ? original.startChoice : startOptions.length === 1 ? startOptions[0].iso : startOptions.find(option => option.iso === draft.startChoice)?.iso;
  const end = endUnchanged ? original.endChoice : endOptions.length === 1 ? endOptions[0].iso : endOptions.find(option => option.iso === draft.endChoice)?.iso;
  function change(value: Partial<CalendarDraft>) { setCalendarDrafts(current => ({ ...current, [key]: { ...draft, ...value, dirty: true } })); setMessage(""); }
  function clear() { setCalendarDrafts(current => { const next = { ...current }; delete next[key]; return next; }); setInitial(defaults()); setConfirm(false); setError(""); }
  async function save(remove = false) {
    if (conflict || (!remove && (!start || !end))) { setError("Choose valid times and explicit occurrences; gaps cannot be saved."); return; }
    const assignment = { projectId: draft.assignment.startsWith("project:") ? draft.assignment.slice(8) : null, taskId: draft.assignment.startsWith("task:") ? draft.assignment.slice(5) : null };
    const schedule = { startAt: start!, endAt: end!, timeZone: draft.zone };
    // Explicit forms, like gestures, submit only intentionally changed groups.
    // Retaining a draft never rebases its other fields onto a background read.
    const changes: BlockChanges = {
      ...(draft.label !== original?.label ? { label: draft.label } : {}),
      ...(!startUnchanged || !endUnchanged ? { schedule } : {}),
      ...(draft.assignment !== original?.assignment ? { assignment } : {}),
    };
    if (record && !remove && !Object.keys(changes).length) { setMessage("No changes to save."); return; }
    const lock = `calendar:${record?.id ?? key}`; if (!beginSave(lock)) return; let committed = false;
    change({ uncertain: remove ? "delete" : !record ? "create" : undefined });
    try {
      const payload = remove ? { revision: draft.revision } : record ? { revision: draft.revision, changes } : { requestKey: draft.requestKey, label: draft.label, schedule, assignment };
      const response = await session.fetch(`/api/workspaces/${workspaceId}/time-blocks${record ? `/${record.id}` : ""}`, { method: remove ? "DELETE" : record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.status === 404) {
        // A missing record and lost membership share the same safe response.
        const access = await session.fetch(`/api/workspaces/${workspaceId}`);
        if (!session.isCurrent(lease)) return;
        if (access.status === 404) { lost(workspaceId); return; }
        if (!access.ok) { setError("Save unconfirmed; workspace access could not be checked. Retry the original intent."); return; }
        if (remove) { committed = true; onSaved({ deleted: true, id: record!.id }); clear(); setMessage("Block is already absent. Work is unchanged."); return; }
        setError(result.error); return;
      }
      if (response.status === 409) { change({ conflict: result.current, uncertain: undefined }); setError("Conflict. Input kept. Review saved block before another explicit save."); return; }
      if (!response.ok) { if (response.status < 500) change({ uncertain: undefined }); setError(result.error ?? "Save unconfirmed; retry the same intent."); return; }
      onSaved(result); clear(); setMessage(remove ? "Block removed. Referenced work is unchanged." : "Saved.");
    } catch { if (session.isCurrent(lease)) setError("Save unconfirmed. Input and create intent kept; retry explicitly."); }
    finally { finishSave(lock, committed); }
  }
  return <form aria-label={record ? `Edit time block ${record.label}` : "Create time block"} onSubmit={event => { event.preventDefault(); void save(); }} className="my-5 min-w-0 space-y-4 rounded border bg-white p-4">
    <h3 className="break-words text-xl font-semibold">{record ? `Edit ${record.label}` : "Create empty or assigned block"}</h3>
    {draft.dirty && <p>Unsaved calendar draft (kept during planner navigation)</p>}
    {draft.uncertain && <p role="status">Original {draft.uncertain} intent retained. Retry to reconcile before changing input, or explicitly discard it.</p>}
    <fieldset disabled={pending || !!draft.uncertain} className="min-w-0 space-y-3"><label className="block">Block label<input className={control} required maxLength={200} value={draft.label} onChange={event => change({ label: event.target.value })} /></label>
      <label className="block">Editing time zone<input className={control} value={draft.zone} onChange={event => change({ zone: event.target.value, startChoice: "", endChoice: "" })} /></label>
      <label className="block">Start time<input type="datetime-local" className={control} required value={draft.start} onChange={event => change({ start: event.target.value, startChoice: "" })} /></label><TimeChoices options={startOptions} value={draft.startChoice} change={value => change({ startChoice: value })} label="Start occurrence" />
      <label className="block">End time<input type="datetime-local" className={control} required value={draft.end} onChange={event => change({ end: event.target.value, endChoice: "" })} /></label><TimeChoices options={endOptions} value={draft.endChoice} change={value => change({ endChoice: value })} label="End occurrence" />
      {start && end && <p>Actual elapsed hours: {(Date.parse(end) - Date.parse(start)) / 3600000}</p>}
      <label className="block">Assigned work<select aria-label="Assigned work" className={control} disabled={pickerFailed} value={draft.assignment} onChange={event => change({ assignment: event.target.value })}><option value="">Empty block (unassigned)</option>{work.map(item => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.kind}: {item.title} · {item.context}</option>)}</select></label>
    </fieldset>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={pending || !!conflict || pickerFailed || draft.uncertain === "delete"}>{pending ? "Saving…" : record ? "Save block" : "Create block"}</button><button className={button} disabled={pending} type="button" onClick={clear}>Discard draft / new create intent</button>{record && <button className={button} disabled={pending} type="button" onClick={() => setConfirm(true)}>Remove block</button>}</div>
    {(confirm || draft.uncertain === "delete") && <div role="alert"><p className="break-words">Remove block “{record!.label}”? Only this block is removed.</p><button className={button} type="button" disabled={pending || !!conflict} onClick={() => void save(true)}>Confirm removal</button>{draft.uncertain !== "delete" && <button className={button} type="button" onClick={() => setConfirm(false)}>Cancel removal</button>}</div>}
    {error && <p role="alert" className="break-words text-red-800">{error}</p>}{message && <p role="status">{message}</p>}
    {conflict && <div aria-label="Saved block version" role="region" className="space-y-3 border-t pt-3"><p className="break-words">Saved: {conflict.label} · {conflict.startAt} – {conflict.endAt} · {conflict.timeZone} · revision {conflict.revision} · {conflict.project?.title ?? conflict.task?.title ?? "Empty"}</p><button type="button" className={button} onClick={() => { onSaved(conflict); clear(); }}>Load saved block</button><button type="button" className={button} onClick={() => { change({ revision: conflict.revision, conflict: undefined }); setError(""); }}>Reviewed: keep proposed input</button></div>}
  </form>;
}
function TimeChoices({ options, value, change, label }: { options: { iso: string; offset: string }[]; value: string; change: (value: string) => void; label: string }) {
  if (!options.length) return <p role="alert">Invalid or nonexistent local time in the editing zone.</p>;
  if (options.length === 1) return <p className="text-sm">{label}: UTC offset {options[0].offset}</p>;
  return <label className="block">{label} (repeated local time)<select aria-label={`${label} (repeated local time)`} className={control} required value={value} onChange={event => change(event.target.value)}><option value="">Choose an occurrence explicitly</option>{options.map((option, index) => <option key={option.iso} value={option.iso}>{index + 1}: UTC{option.offset}</option>)}</select></label>;
}
