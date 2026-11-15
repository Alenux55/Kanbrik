"use client";
import { TaskLabelBadges } from "./task-labels";
import Link from "next/link";
import { WorkListsPanel } from "./work-lists-panel";
import { WorkActivityPanel } from "./work-activity-panel";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import type { TrashBatchRecord, TrashDetail } from "@/lib/trash-contracts";
import { taskStatusLabels, type TaskStatus } from "@/lib/task-statuses";
import { usePlannerContext } from "./planner-context";
import { usePlannerSession } from "./planner-session";
import { usePlanningDrafts } from "./planning-drafts";
import { button, control } from "./ui/planner-controls";

export function TrashPlanner({
  requestedWorkspace,
}: {
  requestedWorkspace: string;
}) {
  const context = usePlannerContext(),
    session = usePlannerSession(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const router = useRouter();
  const workspaceId = requestedWorkspace || context.defaultWorkspaceId;
  const workspace = context.workspaces.find((item) => item.id === workspaceId);
  const [data, setData] = useState<{
    workspaceId: string;
    rows: TrashBatchRecord[];
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const version = ++generation.current;
    if (!workspace) return;
    session
      .fetch(`/api/workspaces/${workspaceId}/trash`)
      .then(async (response) => {
        if (response.status === 404) {
          if (active && session.isCurrent(lease)) context.revoke(workspaceId);
          throw new Error("Workspace access ended.");
        }
        if (!response.ok)
          throw new Error(
            "Trash could not load. Retry; the list is not confirmed empty.",
          );
        const rows = await response.json();
        if (
          active &&
          version === generation.current &&
          session.isCurrent(lease)
        ) {
          setData({ workspaceId, rows });
          setError("");
        }
      })
      .catch((failure) => {
        if (
          active &&
          version === generation.current &&
          session.isCurrent(lease)
        ) {
          setData(null);
          setError(
            failure instanceof Error
              ? failure.message
              : "Trash unavailable. Retry.",
          );
        }
      });
    return () => {
      active = false;
    };
    // Membership choices are refreshed by the shared context; this load is scoped
    // to the selected ID and save generation, not the context object's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, !!workspace, retry, store.saveEpoch, session, lease]);
  const rows = data?.workspaceId === workspaceId ? data.rows : null;
  const retained = Object.values(store.trashRestores)
    .filter(
      (item) =>
        item.workspaceId === workspaceId &&
        !rows?.some((row) => row.id === item.batch.id),
    )
    .map((item) => item.batch);
  return (
    <section className="min-w-0">
      <h1 className="text-4xl font-semibold">Trash</h1>
      <p className="my-4">
        Restore exactly one confirmed operation, including its contained work.
        There is no permanent-delete or automatic-purge action here. Scheduled
        blocks keep their references; removed or reassigned blocks are not
        recreated.
      </p>
      <label className="block max-w-xl">
        Trash workspace
        <select
          aria-label="Trash workspace"
          className={control}
          value={workspaceId}
          onChange={(event) => {
            router.replace(
              `/trash?workspaceId=${encodeURIComponent(event.target.value)}`,
            );
          }}
        >
          {!workspace && (
            <option value={workspaceId}>Unavailable workspace</option>
          )}
          {context.workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.kind})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button + " my-4"}
        onClick={() => setRetry((value) => value + 1)}
      >
        Refresh Trash
      </button>
      {!workspace ? (
        <p role="alert">
          This workspace is not accessible. Select one of your workspaces.
        </p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {!rows && !error && <p role="status">Loading Trash…</p>}
          {rows?.length === 0 && retained.length === 0 && (
            <p>No work in this workspace’s Trash.</p>
          )}
          {[...(rows ?? []), ...retained].map((batch) => (
            <Batch
              key={workspaceId + "/" + batch.id}
              batch={batch}
              refresh={() => setRetry((value) => value + 1)}
            />
          ))}
        </>
      )}
    </section>
  );
}

function Batch({
  batch,
  refresh,
}: {
  batch: TrashBatchRecord;
  refresh: () => void;
}) {
  const context = usePlannerContext(),
    session = usePlannerSession(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const [detail, setDetail] = useState<TrashDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const key = batch.workspaceId + "/" + batch.id,
    lock = "restore:" + key;
  const intent = store.trashRestores[key];
  const pending = store.savingKeys.includes(lock);
  const path = `/api/workspaces/${batch.workspaceId}/trash/${batch.id}`;
  async function read() {
    setError("");
    try {
      const response = await session.fetch(path);
      const result = await response.json();
      if (!session.isCurrent(lease) || !alive.current) return;
      if (response.status === 404) {
        const access = await session.fetch(
          `/api/workspaces/${batch.workspaceId}`,
        );
        if (!session.isCurrent(lease) || !alive.current) return;
        if (access.status === 404) {
          context.revoke(batch.workspaceId);
          return;
        }
      }
      if (!response.ok)
        throw new Error(result.error ?? "Trash detail unavailable. Retry.");
      setDetail(result);
    } catch (failure) {
      if (session.isCurrent(lease) && alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Detail load failed. Retry.",
        );
    }
  }
  async function restore() {
    if (busy.current || !store.beginSave(lock)) return;
    busy.current = true;
    setError("");
    setNotice("");
    let committed = false;
    const original = intent ?? {
      workspaceId: batch.workspaceId,
      batch,
      uncertain: false,
    };
    store.setTrashRestores((current) => ({
      ...current,
      [key]: {
        ...original,
        uncertain: true,
        error: undefined,
        requires: undefined,
      },
    }));
    try {
      const response = await session.fetch(path + "/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: original.batch.revision,
          ...(original.statusResolution
            ? {
                statusImpactDigest: original.statusResolution.impactDigest,
                statusReplacements: original.statusReplacements ?? {},
              }
            : {}),
        }),
      });
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (!response.ok) {
        if (response.status === 404) {
          const access = await session.fetch(
            `/api/workspaces/${batch.workspaceId}`,
          );
          if (!session.isCurrent(lease)) return;
          if (access.status === 404) {
            context.revoke(batch.workspaceId);
            return;
          }
        }
        store.setTrashRestores((current) => ({
          ...current,
          [key]: {
            ...original,
            uncertain: response.status >= 500,
            error:
              result.error ?? "Restore is not confirmed. Refresh and review.",
            requires: result.current?.requires,
            statusResolution:
              result.current?.statusResolution ?? original.statusResolution,
          },
        }));
        return;
      }
      store.setTrashRestores((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (alive.current)
        setNotice(
          result.replayed
            ? "The original Restore already completed. Current Trash is refreshing."
            : "Restored the original work IDs and statuses. Current views are refreshing.",
        );
      context.announce(
        result.replayed
          ? "Original Restore already completed; current views refreshed."
          : "Work restored. Existing linked blocks now show active work.",
      );
      context.refresh();
      refresh();
    } catch {
      if (session.isCurrent(lease))
        store.setTrashRestores((current) => ({
          ...current,
          [key]: {
            ...original,
            uncertain: true,
            error:
              "Restore unconfirmed. Retry this same batch/revision to reconcile the outcome; no new work will be created.",
          },
        }));
    } finally {
      busy.current = false;
      store.finishSave(lock, committed);
    }
  }
  return (
    <article
      id={"batch-" + batch.id}
      aria-label={`Trash operation: ${batch.rootTitle}`}
      className="my-5 min-w-0 space-y-3 rounded-xl border bg-white p-4"
    >
      <h2 className="break-words text-xl font-semibold">{batch.rootTitle}</h2>
      <p>
        {batch.projectCount} projects, {batch.taskCount} tasks,{" "}
        {batch.subtaskCount} subtasks.
      </p>
      <p>
        Moved to Trash{" "}
        {DateTime.fromISO(batch.createdAt)
          .setZone(context.zone)
          .toFormat("yyyy-MM-dd HH:mm ZZ")}{" "}
        · {context.zone}
      </p>
      {intent?.error && <p role="alert">{intent.error}</p>}
      {intent?.uncertain && (
        <p role="status">
          Restore is unconfirmed. This retry uses the same batch and expected
          revision.
        </p>
      )}
      {intent?.requires && (
        <Link className="underline" href={"#batch-" + intent.requires}>
          Review the required ancestor’s Trash operation
        </Link>
      )}
      {intent?.statusResolution && (
        <section
          aria-label="Restore status replacements"
          className="space-y-3 border p-3"
        >
          <h3 className="font-semibold">Review status replacements</h3>
          <p>
            These original statuses were retired. Restoring will keep the work
            IDs and use your explicit replacements.
          </p>
          {intent.statusResolution.requirements.map((r) => (
            <label key={r.statusId} className="block">
              {r.name}: {r.count} tasks
              <select
                aria-label={"Replacement for " + r.name}
                className={control}
                disabled={pending || intent.uncertain}
                value={intent.statusReplacements?.[r.statusId] ?? ""}
                onChange={(e) =>
                  store.setTrashRestores((current) => ({
                    ...current,
                    [key]: {
                      ...current[key],
                      statusReplacements: {
                        ...current[key].statusReplacements,
                        [r.statusId]: e.target.value,
                      },
                    },
                  }))
                }
              >
                <option value="">Choose an active status</option>
                {intent.statusResolution!.choices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.completed ? " (completed)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={
            pending ||
            !!intent?.statusResolution?.requirements.some(
              (r) =>
                !intent.statusResolution!.choices.some(
                  (d) => d.id === intent.statusReplacements?.[r.statusId],
                ),
            )
          }
          onClick={() => void restore()}
        >
          {pending
            ? "Restoring…"
            : intent?.uncertain
              ? "Retry same Restore"
              : intent?.statusResolution
                ? "Confirm Restore with replacements"
                : "Restore"}
        </button>
        <button
          type="button"
          className={button}
          disabled={pending}
          onClick={() => void read()}
        >
          View read-only detail
        </button>
        {intent && (
          <button
            type="button"
            className={button}
            disabled={pending}
            onClick={() =>
              store.setTrashRestores((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              })
            }
          >
            Discard local Restore intent
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {detail && (
        <section
          aria-label="Trashed work detail"
          className="space-y-4 border-t pt-4"
        >
          {detail.restoredAt && (
            <p>
              This operation was restored; detail shows its original members’
              current rows.
            </p>
          )}
          {[
            ...detail.projects.map((item) => ({
              ...item,
              kind: "Project",
              tags: [],
              status: "",
            })),
            ...detail.tasks.map((item) => ({
              ...item,
              kind: item.parentId ? "Subtask" : "Task",
              status:
                item.statusName ?? taskStatusLabels[item.status as TaskStatus],
            })),
          ].map((item) => (
            <div key={item.kind + item.id} className="space-y-2">
              <h3 className="break-words font-semibold">
                {item.kind}: {item.title}
              </h3>
              <p>
                {item.status} · Revision {item.revision} ·{" "}
                {item.deletedAt ? "In Trash" : "Active"}
              </p>
              <p className="whitespace-pre-wrap break-words">
                {item.description}
              </p>
              <TaskLabelBadges task={item} />
              <WorkActivityPanel
                readOnly
                target={{
                  workspaceId: batch.workspaceId,
                  kind: item.kind === "Project" ? "projects" : "tasks",
                  record:
                    item.kind === "Project"
                      ? detail.projects.find((row) => row.id === item.id)!
                      : detail.tasks.find((row) => row.id === item.id)!,
                }}
              />
              <WorkListsPanel
                readOnly
                target={{
                  workspaceId: batch.workspaceId,
                  kind: item.kind === "Project" ? "projects" : "tasks",
                  record:
                    item.kind === "Project"
                      ? detail.projects.find((row) => row.id === item.id)!
                      : detail.tasks.find((row) => row.id === item.id)!,
                }}
              />
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
