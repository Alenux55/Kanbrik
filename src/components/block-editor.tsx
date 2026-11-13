"use client";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts } from "./planning-drafts";
import { usePlannerContext } from "./planner-context";
import { EditorDialog } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";
import { wallOptions } from "@/lib/calendar-time";
import {
  blockDraft,
  choosePointerStart,
  type CalendarDraft,
} from "@/lib/calendar-draft";
import type { BlockRecord, editBlockInput } from "@/lib/calendar-contracts";
import type { z } from "zod";
import type { Work } from "./calendar";
import Link from "next/link";
type BlockChanges = z.infer<typeof editBlockInput>["changes"];
export function BlockEditor({
  workspaceId,
  zone,
  day,
  record,
  work,
  pickerFailed,
  onSaved,
  lost,
  close,
  destinationControl,
}: {
  workspaceId: string;
  zone: string;
  day: string;
  record?: BlockRecord;
  work: Work[];
  pickerFailed: boolean;
  onSaved: (record: BlockRecord | { deleted: true; id: string }) => void;
  lost: (id: string) => void;
  close: () => void;
  destinationControl?: React.ReactNode;
}) {
  const context = usePlannerContext();
  const alive = useRef(true);
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const {
    calendarDrafts,
    setCalendarDrafts,
    beginSave,
    finishSave,
    savingKeys,
  } = usePlanningDrafts();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const key = `${workspaceId}/blocks/${record?.id ?? "new"}`;
  function defaults(): CalendarDraft {
    if (record) return { ...blockDraft(record, zone), dirty: false };
    return {
      label: "Time block",
      zone,
      start: `${day}T12:00`,
      end: `${day}T15:00`,
      startChoice: "",
      endChoice: "",
      assignment: "",
      revision: 1,
      requestKey: crypto.randomUUID(),
      dirty: false,
    };
  }
  const [initial, setInitial] = useState(defaults);
  const draft = calendarDrafts[key] ?? (record ? defaults() : initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const conflict = draft.conflict;
  const [confirm, setConfirm] = useState(false);
  const pending = savingKeys.includes(`calendar:${record?.id ?? key}`);
  const retainedAssignment = record?.projectId
    ? `project:${record.projectId}`
    : record?.taskId
      ? `task:${record.taskId}`
      : "";
  const missingAssignment =
    !!draft.assignment &&
    !work.some((item) => `${item.kind}:${item.id}` === draft.assignment);
  const unavailableAssignment =
    missingAssignment && draft.assignment !== retainedAssignment;
  const startOptions = wallOptions(draft.start, draft.zone),
    endOptions = wallOptions(draft.end, draft.zone);
  const original = draft.base ? blockDraft(draft.base, draft.zone) : null;
  const startUnchanged =
    original &&
    draft.zone === original.zone &&
    draft.start === original.start &&
    draft.startChoice === original.startChoice;
  const endUnchanged =
    original &&
    draft.zone === original.zone &&
    draft.end === original.end &&
    draft.endChoice === original.endChoice;
  const start = startUnchanged
    ? original.startChoice
    : startOptions.length === 1
      ? startOptions[0].iso
      : startOptions.find((option) => option.iso === draft.startChoice)?.iso;
  const end = endUnchanged
    ? original.endChoice
    : endOptions.length === 1
      ? endOptions[0].iso
      : endOptions.find((option) => option.iso === draft.endChoice)?.iso;
  function change(value: Partial<CalendarDraft>) {
    setCalendarDrafts((current) => ({
      ...current,
      [key]: { ...draft, ...value, dirty: true },
    }));
    setMessage("");
  }
  function clear() {
    setCalendarDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setInitial(defaults());
    setConfirm(false);
    setError("");
  }
  async function save(remove = false) {
    if (conflict || (!remove && (!start || !end))) {
      setError(
        "Choose valid times and explicit occurrences; gaps cannot be saved.",
      );
      return;
    }
    const assignment = {
      projectId: draft.assignment.startsWith("project:")
        ? draft.assignment.slice(8)
        : null,
      taskId: draft.assignment.startsWith("task:")
        ? draft.assignment.slice(5)
        : null,
    };
    const schedule = { startAt: start!, endAt: end!, timeZone: draft.zone };
    // Explicit forms, like gestures, submit only intentionally changed groups.
    // Retaining a draft never rebases its other fields onto a background read.
    const changes: BlockChanges = {
      ...(draft.label !== original?.label ? { label: draft.label } : {}),
      ...(!startUnchanged || !endUnchanged ? { schedule } : {}),
      ...(draft.assignment !== original?.assignment ? { assignment } : {}),
    };
    if (record && !remove && !Object.keys(changes).length) {
      setMessage("No changes to save.");
      return;
    }
    const lock = `calendar:${record?.id ?? key}`;
    if (!beginSave(lock)) return;
    let committed = false;
    change({ uncertain: remove ? "delete" : !record ? "create" : undefined });
    try {
      const payload = remove
        ? { revision: draft.revision }
        : record
          ? { revision: draft.revision, changes }
          : {
              requestKey: draft.requestKey,
              label: draft.label,
              schedule,
              assignment,
            };
      const response = await session.fetch(
        `/api/workspaces/${workspaceId}/time-blocks${record ? `/${record.id}` : ""}`,
        {
          method: remove ? "DELETE" : record ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.status === 404) {
        // A missing record and lost membership share the same safe response.
        const access = await session.fetch(`/api/workspaces/${workspaceId}`);
        if (!session.isCurrent(lease)) return;
        if (!alive.current) return;
        if (access.status === 404) {
          lost(workspaceId);
          return;
        }
        if (!access.ok) {
          setError(
            "Save unconfirmed; workspace access could not be checked. Retry the original intent.",
          );
          return;
        }
        if (remove) {
          committed = true;
          onSaved({ deleted: true, id: record!.id });
          clear();
          setMessage("Block is already absent. Work is unchanged.");
          return;
        }
        setError(result.error);
        return;
      }
      if (response.status === 409) {
        change({ conflict: result.current, uncertain: undefined });
        setError(
          "Conflict. Input kept. Review saved block before another explicit save.",
        );
        return;
      }
      if (!response.ok) {
        if (response.status < 500) change({ uncertain: undefined });
        setError(result.error ?? "Save unconfirmed; retry the same intent.");
        return;
      }
      clear();
      if (!alive.current) return;
      onSaved(result);
      close();
      context.announce(
        remove
          ? "Block removed. Referenced work is unchanged."
          : "Saved time block. Check the selected range and workspace filters if it is outside this view.",
      );
      setMessage(
        remove ? "Block removed. Referenced work is unchanged." : "Saved.",
      );
    } catch {
      if (session.isCurrent(lease))
        setError(
          "Save unconfirmed. Input and create intent kept; retry explicitly.",
        );
    } finally {
      finishSave(lock, committed);
    }
  }
  return (
    <EditorDialog
      title={record ? `Edit time block ${record.label}` : "Create time block"}
      dirty={draft.dirty}
      pending={pending}
      discard={clear}
      close={close}
    >
      <p>
        Workspace: {context.workspaces.find((w) => w.id === workspaceId)?.name}.
        Workspace reference zone:{" "}
        {context.workspaces.find((w) => w.id === workspaceId)?.timeZone ??
          "UTC"}
        .
      </p>
      {destinationControl}
      <form
        aria-label={
          record ? `Edit time block ${record.label}` : "Create time block"
        }
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="my-5 min-w-0 space-y-4 rounded border bg-white p-4"
      >
        <h3 className="break-words text-xl font-semibold">
          {record ? `Edit ${record.label}` : "Create empty or assigned block"}
        </h3>
        {draft.dirty && (
          <p>Unsaved calendar draft (kept during planner navigation)</p>
        )}
        {draft.uncertain && (
          <p role="status">
            Original {draft.uncertain} intent retained. Retry to reconcile
            before changing input, or explicitly discard it.
          </p>
        )}
        <fieldset
          disabled={pending || !!draft.uncertain}
          className="min-w-0 space-y-3"
        >
          <label className="block">
            Block label
            <input
              className={control}
              required
              maxLength={200}
              value={draft.label}
              onChange={(event) => change({ label: event.target.value })}
            />
          </label>
          <p>
            Input time zone: {draft.zone} (captured for this draft). Change your
            preferred zone in User settings after resolving this edit.
          </p>
          <label className="block">
            Start time
            <input
              type="datetime-local"
              className={control}
              required
              value={draft.start}
              onChange={(event) =>
                change({ start: event.target.value, startChoice: "" })
              }
            />
          </label>
          <TimeChoices
            options={startOptions}
            value={draft.startChoice}
            change={(value) => change(choosePointerStart(draft, value))}
            label="Start occurrence"
          />
          <label className="block">
            End time
            <input
              type="datetime-local"
              className={control}
              required
              value={draft.end}
              onChange={(event) =>
                change({
                  end: event.target.value,
                  endChoice: "",
                  pointerDuration: undefined,
                })
              }
            />
          </label>
          <TimeChoices
            options={endOptions}
            value={draft.endChoice}
            change={(value) =>
              change({ endChoice: value, pointerDuration: undefined })
            }
            label="End occurrence"
          />
          {start && end && (
            <p>
              Workspace local:{" "}
              {DateTime.fromISO(start)
                .setZone(
                  context.workspaces.find((w) => w.id === workspaceId)
                    ?.timeZone ?? "UTC",
                )
                .toFormat("yyyy-MM-dd HH:mm ZZ")}{" "}
              –{" "}
              {DateTime.fromISO(end)
                .setZone(
                  context.workspaces.find((w) => w.id === workspaceId)
                    ?.timeZone ?? "UTC",
                )
                .toFormat("yyyy-MM-dd HH:mm ZZ")}
            </p>
          )}
          {start && end && (
            <p>
              Actual elapsed hours:{" "}
              {(Date.parse(end) - Date.parse(start)) / 3600000}
            </p>
          )}
          <label className="block">
            Assigned work
            <select
              aria-label="Assigned work"
              className={control}
              disabled={pickerFailed}
              value={draft.assignment}
              onChange={(event) => change({ assignment: event.target.value })}
            >
              <option value="">Empty block (unassigned)</option>
              {draft.assignment &&
                !work.some(
                  (item) => `${item.kind}:${item.id}` === draft.assignment,
                ) && (
                  <option value={draft.assignment}>
                    {record?.workInTrash &&
                    draft.assignment === retainedAssignment
                      ? "Work in Trash (retained reference)"
                      : "Unavailable work — choose active work or Restore"}
                  </option>
                )}
              {work.map((item) => (
                <option
                  key={`${item.kind}:${item.id}`}
                  value={`${item.kind}:${item.id}`}
                >
                  {item.kind}: {item.title} · {item.context}
                </option>
              ))}
            </select>
          </label>
          {(record?.workInTrash || missingAssignment) && (
            <p role="status">
              {record?.workInTrash
                ? "Work in Trash. You can keep its reference while editing this existing interval, clear the assignment, or Remove this time block."
                : unavailableAssignment
                  ? "This proposed assignment is unavailable. Choose active work or restore it first."
                  : "Referenced work is not active in this picker. You can retain this existing reference, clear it, or review workspace Trash."}{" "}
              <Link
                className="underline"
                href={`/trash?workspaceId=${encodeURIComponent(workspaceId)}`}
              >
                Review workspace Trash / Restore
              </Link>
              .
            </p>
          )}
        </fieldset>
        {work
          .filter((item) => `${item.kind}:${item.id}` === draft.assignment)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={button}
              disabled={pending}
              onClick={() => {
                // An explicit keep-for-later action avoids nesting modal histories.
                close();
                context.openEntity({
                  kind: item.kind === "project" ? "projects" : "tasks",
                  workspaceId,
                  record: item.record,
                });
              }}
            >
              {draft.dirty
                ? "Keep block draft and edit assigned work"
                : "Edit assigned work"}
            </button>
          ))}
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={
              pending ||
              !!conflict ||
              pickerFailed ||
              (unavailableAssignment && draft.uncertain !== "create") ||
              draft.uncertain === "delete"
            }
          >
            {pending ? "Saving…" : record ? "Save block" : "Create block"}
          </button>
          {record && (
            <button
              className={button}
              disabled={pending}
              type="button"
              aria-label={`Remove time block: ${record.label}`}
              onClick={() => setConfirm(true)}
            >
              Remove
            </button>
          )}
        </div>
        {(confirm || draft.uncertain === "delete") && (
          <div role="alert">
            <p className="break-words">
              Remove time block “{record!.label}”? Only this time block is
              removed. The task or project and its other blocks are kept.
            </p>
            <button
              className={button}
              type="button"
              disabled={pending || !!conflict}
              onClick={() => void save(true)}
            >
              Confirm removal
            </button>
            {draft.uncertain !== "delete" && (
              <button
                className={button}
                type="button"
                onClick={() => setConfirm(false)}
              >
                Cancel removal
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="break-words text-red-800">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {conflict && (
          <div
            aria-label="Saved block version"
            role="region"
            className="space-y-3 border-t pt-3"
          >
            <p className="break-words">
              Saved: {conflict.label} · {conflict.startAt} – {conflict.endAt} ·{" "}
              {conflict.timeZone} · revision {conflict.revision} ·{" "}
              {conflict.project?.title ?? conflict.task?.title ?? "Empty"}
            </p>
            <button
              type="button"
              className={button}
              onClick={() => {
                onSaved(conflict);
                clear();
              }}
            >
              Load saved block
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                change({ revision: conflict.revision, conflict: undefined });
                setError("");
              }}
            >
              Reviewed: keep proposed input
            </button>
          </div>
        )}
      </form>
    </EditorDialog>
  );
}
function TimeChoices({
  options,
  value,
  change,
  label,
}: {
  options: { iso: string; offset: string }[];
  value: string;
  change: (value: string) => void;
  label: string;
}) {
  if (!options.length)
    return (
      <p role="alert">Invalid or nonexistent local time in the editing zone.</p>
    );
  if (options.length === 1)
    return (
      <p className="text-sm">
        {label}: UTC offset {options[0].offset}
      </p>
    );
  return (
    <label className="block">
      {label} (repeated local time)
      <select
        aria-label={`${label} (repeated local time)`}
        className={control}
        required
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">Choose an occurrence explicitly</option>
        {options.map((option, index) => (
          <option key={option.iso} value={option.iso}>
            {index + 1}: UTC{option.offset}
          </option>
        ))}
      </select>
    </label>
  );
}
