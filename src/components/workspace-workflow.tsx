"use client";
import { useEffect, useRef, useState } from "react";
import type {
  WorkflowRecord,
  WorkflowProposal,
  WorkflowImpact,
} from "@/lib/workflow-contracts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { EditorDialog } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";
export function WorkspaceWorkflow({ workspaceId }: { workspaceId: string }) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture),
    [data, setData] = useState<WorkflowRecord | null>(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [open, setOpen] = useState(
      () => !!store.supplementalDrafts[workspaceId + "/workflow"],
    ),
    [preview, setPreview] = useState<WorkflowImpact | null>(null);
  const alive = useRef(true),
    handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  const key = workspaceId + "/workflow",
    lock = "configuration:" + workspaceId,
    draft = store.supplementalDrafts[key],
    pending = store.savingKeys.includes(lock),
    path = `/api/workspaces/${workspaceId}/workflow`;
  const mutation = useSupplementalMutation(() => {
    setPreview(null);
    setOpen(false);
    setEpoch((x) => x + 1);
  });
  useEffect(() => {
    let active = true;
    alive.current = true;
    session
      .fetch(path)
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 404 && active && session.isCurrent(lease))
            handlers.current.revoke(workspaceId);
          throw Error();
        }
        const result = await r.json();
        if (active && session.isCurrent(lease)) {
          setData(result);
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setData(null);
          setError(
            "Workflow unavailable. Retained input is kept; refresh to check access.",
          );
        }
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [session, lease, path, workspaceId, epoch]);
  function start() {
    if (!data?.owner) return;
    store.setSupplementalDrafts((current) =>
      current[key]
        ? current
        : {
            ...current,
            [key]: {
              workspaceId,
              label: "Workspace workflow",
              form: "workflow",
              path,
              method: "POST",
              values: {
                revision: data.revision,
                defaultStatusId: data.defaultStatusId,
                definitions: data.definitions.map((d) => ({
                  id: d.id,
                  name: d.name,
                  completed: d.completed,
                  archived: !!d.archivedAt,
                })),
                replacements: {},
              },
            },
          },
    );
    setPreview(null);
    setOpen(true);
  }
  const proposal = draft?.values as unknown as WorkflowProposal | undefined;
  function change(next: WorkflowProposal) {
    if (!draft || draft.uncertain) return;
    mutation.change(key, {
      values: { ...next },
      error: undefined,
      conflict: undefined,
    });
    setPreview(null);
  }
  function definition(
    id: string,
    values: Partial<WorkflowProposal["definitions"][number]>,
  ) {
    if (!proposal) return;
    change({
      ...proposal,
      definitions: proposal.definitions.map((d) =>
        d.id === id ? { ...d, ...values } : d,
      ),
    });
  }
  async function inspect() {
    if (!proposal || pending || !store.beginSave(lock)) return;
    try {
      const body = {
        revision: proposal.revision,
        defaultStatusId: proposal.defaultStatusId,
        definitions: proposal.definitions,
        replacements: proposal.replacements,
      };
      const r = await session.fetch(path + "/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        result = await r.json();
      if (!alive.current || !session.isCurrent(lease)) return;
      if (r.status === 404) {
        handlers.current.revoke(workspaceId);
        return;
      }
      if (!r.ok) {
        mutation.change(key, {
          error: result.error ?? "Preview unavailable. Input is kept.",
          conflict: r.status === 409 ? result.current : undefined,
        });
        return;
      }
      setPreview(result);
      mutation.change(key, {
        values: {
          ...body,
          impactDigest: result.impactDigest,
          requestKey:
            typeof draft?.values.requestKey === "string"
              ? draft.values.requestKey
              : crypto.randomUUID(),
        },
        error: undefined,
      });
    } catch {
      if (alive.current && session.isCurrent(lease))
        mutation.change(key, {
          error:
            "Preview failed. No configuration change was sent; input is kept.",
        });
    } finally {
      store.finishSave(lock, false);
    }
  }
  if (!context.workspaces.some((w) => w.id === workspaceId)) return null;
  return (
    <section
      aria-label="Workspace task workflow"
      className="my-6 min-w-0 space-y-3 rounded border p-4"
    >
      <h2 className="text-xl font-semibold">Task workflow</h2>
      <p>
        Definitions belong to this workspace. Names, completion meaning and
        creation default apply to all its work.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Creation default:{" "}
            {data.definitions.find((d) => d.id === data.defaultStatusId)?.name}
          </p>
          <ul>
            {data.definitions
              .filter((d) => !d.archivedAt)
              .map((d) => (
                <li key={d.id}>
                  {d.name} · {d.completed ? "Completed" : "Open"}
                </li>
              ))}
          </ul>
          {data.owner ? (
            <button type="button" className={button} onClick={start}>
              Configure task statuses
            </button>
          ) : (
            <p>
              Only the workspace owner can configure statuses. Editors can use
              active statuses.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={() => setEpoch((x) => x + 1)}
      >
        Refresh workflow
      </button>
      <ConfigurationHistory workspaceId={workspaceId} />
      {open && draft && proposal && (
        <EditorDialog
          title="Configure task statuses"
          dirty
          pending={pending}
          discard={() => {
            mutation.discard(key);
            setPreview(null);
          }}
          close={() => setOpen(false)}
        >
          <p>
            Review changes before saving. Retirement reassigns only the
            confirmed active tasks; work already in Trash keeps its original
            status until an explicit Restore resolution.
          </p>
          <fieldset
            disabled={pending || draft.uncertain || !data?.owner}
            className="min-w-0 space-y-4"
          >
            <label className="block">
              Creation default
              <select
                aria-label="Creation default"
                className={control}
                value={proposal.defaultStatusId}
                onChange={(e) =>
                  change({ ...proposal, defaultStatusId: e.target.value })
                }
              >
                {proposal.definitions
                  .filter((d) => !d.archived && !d.completed)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            {proposal.definitions.map((d, index) => (
              <section
                key={d.id}
                aria-label={"Status definition: " + d.name}
                className="min-w-0 space-y-2 rounded border p-3"
              >
                <label className="block">
                  Status name
                  <input
                    className={control}
                    maxLength={80}
                    required
                    value={d.name}
                    onChange={(e) => definition(d.id, { name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={d.completed}
                    onChange={(e) =>
                      definition(d.id, { completed: e.target.checked })
                    }
                  />{" "}
                  Counts as completed
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={d.archived}
                    onChange={(e) =>
                      definition(d.id, { archived: e.target.checked })
                    }
                  />{" "}
                  Retired
                </label>
                {d.archived &&
                  !data?.definitions.find((old) => old.id === d.id)
                    ?.archivedAt && (
                    <label className="block">
                      Replacement for active tasks
                      <select
                        aria-label={"Replacement for " + d.name}
                        className={control}
                        value={proposal.replacements[d.id] ?? ""}
                        onChange={(e) =>
                          change({
                            ...proposal,
                            replacements: {
                              ...proposal.replacements,
                              [d.id]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Choose if occupied</option>
                        {proposal.definitions
                          .filter((n) => !n.archived && n.id !== d.id)
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                              {n.completed ? " (completed)" : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                <div className="flex flex-wrap gap-2">
                  {[-1, 1].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      className={button}
                      disabled={
                        index + delta < 0 ||
                        index + delta >= proposal.definitions.length
                      }
                      onClick={() => {
                        const definitions = [...proposal.definitions];
                        [definitions[index], definitions[index + delta]] = [
                          definitions[index + delta],
                          definitions[index],
                        ];
                        change({ ...proposal, definitions });
                      }}
                    >
                      Move status {delta < 0 ? "up" : "down"}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <button
              type="button"
              className={button}
              disabled={proposal.definitions.length >= 200}
              onClick={() =>
                change({
                  ...proposal,
                  definitions: [
                    ...proposal.definitions,
                    {
                      id: crypto.randomUUID(),
                      name: "New status",
                      completed: false,
                      archived: false,
                    },
                  ],
                })
              }
            >
              Add status
            </button>
          </fieldset>
          {draft.error && <p role="alert">{draft.error}</p>}
          {draft.conflict && (
            <section
              aria-label="Saved workflow version"
              className="space-y-2 border p-3"
            >
              <h3>Workflow changed — review the saved version</h3>
              <ul>
                {(draft.conflict as unknown as WorkflowRecord).definitions?.map(
                  (d) => (
                    <li key={d.id}>
                      {d.name} ·{" "}
                      {d.archivedAt
                        ? "Retired"
                        : d.completed
                          ? "Completed"
                          : "Open"}
                    </li>
                  ),
                )}
              </ul>
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => {
                  mutation.discard(key);
                  setOpen(false);
                  setEpoch((x) => x + 1);
                }}
              >
                Load saved workflow
              </button>
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => {
                  const latest = draft.conflict as unknown as WorkflowRecord;
                  setData(latest);
                  change({
                    ...proposal,
                    revision: latest.revision,
                    definitions: [
                      ...proposal.definitions,
                      ...latest.definitions
                        .filter(
                          (d) =>
                            !proposal.definitions.some(
                              (old) => old.id === d.id,
                            ),
                        )
                        .map((d) => ({
                          id: d.id,
                          name: d.name,
                          completed: d.completed,
                          archived: !!d.archivedAt,
                        })),
                    ],
                  });
                }}
              >
                Review complete: keep workflow input
              </button>
            </section>
          )}
          {preview && (
            <section
              aria-label="Workflow impact"
              className="space-y-2 rounded border bg-amber-50 p-3"
            >
              <h3 className="font-semibold">Review exact impact</h3>
              <p>
                {preview.activeTaskCount} active tasks ({preview.subtaskCount}{" "}
                subtasks) will be reassigned. {preview.trashedTaskCount} tasks
                in Trash retain original status references.
              </p>
              {preview.reassignments.map((r, i) => (
                <p key={i}>
                  {r.from} → {r.to}: {r.count} active tasks
                </p>
              ))}
              {preview.completionChanges.map((c, i) => (
                <p key={i}>
                  {c.name}: {c.before ? "Completed" : "Open"} →{" "}
                  {c.after ? "Completed" : "Open"}; affects completion display
                  for {c.active} active and {c.trashed} trashed tasks.
                </p>
              ))}
            </section>
          )}
          {draft.uncertain && (
            <p role="status">
              Workflow save is unconfirmed. Input is frozen; retry the same
              operation to reconcile it without repeating reassignments.
            </p>
          )}
          <div className="my-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={
                pending || draft.uncertain || !!draft.conflict || !data?.owner
              }
              onClick={() => void inspect()}
            >
              Preview workflow changes
            </button>
            <button
              type="button"
              className={button}
              disabled={
                pending ||
                !!draft.conflict ||
                (!preview && !draft.uncertain) ||
                !data?.owner
              }
              onClick={() => void mutation.run(key, draft)}
            >
              {draft.uncertain
                ? "Retry same workflow save"
                : "Confirm workflow changes"}
            </button>
          </div>
        </EditorDialog>
      )}
    </section>
  );
}
function ConfigurationHistory({ workspaceId }: { workspaceId: string }) {
  const session = usePlannerSession(),
    context = usePlannerContext();
  const [lease] = useState(session.capture),
    [rows, setRows] = useState<
      | {
          id: string;
          action: string;
          occurredAt: string;
          actor: { name: string; available: boolean };
          changes: {
            field: string;
            label?: string;
            before: string | null;
            after: string | null;
            beforeLabel?: string;
            afterLabel?: string;
          }[];
        }[]
      | null
    >(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    if (pending) return;
    setPending(true);
    try {
      const r = await session.fetch(
        `/api/workspaces/${workspaceId}/configuration-history`,
      );
      if (!r.ok) {
        if (r.status === 404 && session.isCurrent(lease))
          context.revoke(workspaceId);
        throw Error();
      }
      const data = await r.json();
      if (alive.current && session.isCurrent(lease)) {
        setRows(data);
        setError("");
      }
    } catch {
      if (alive.current && session.isCurrent(lease)) {
        setRows(null);
        setError("Configuration history unavailable; retry.");
      }
    } finally {
      if (alive.current && session.isCurrent(lease)) setPending(false);
    }
  }
  return (
    <details>
      <summary className="min-h-11 cursor-pointer">
        Workspace configuration history
      </summary>
      <p>Shows the latest 50 workspace configuration changes.</p>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={() => void load()}
      >
        Refresh configuration history
      </button>
      {error && <p role="alert">{error}</p>}
      {rows?.map((row) => (
        <article
          key={row.id}
          className="min-w-0 border-t py-3 [overflow-wrap:anywhere]"
        >
          <p>
            {row.action.startsWith("vendor")
              ? "Vendor choices changed"
              : "Workflow changed"}{" "}
            · {row.actor.name}
            {!row.actor.available && " (account unavailable)"} ·{" "}
            <time dateTime={row.occurredAt} title={row.occurredAt}>
              {new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "long",
                timeZone: context.zone,
              }).format(new Date(row.occurredAt))}
            </time>
          </p>
          {row.changes.map((c, i) => (
            <details key={i}>
              <summary className="min-h-11 cursor-pointer">
                {c.label ?? c.field}
              </summary>
              <p>Before</p>
              <pre className="whitespace-pre-wrap break-words font-sans">
                {c.beforeLabel ?? c.before ?? "None"}
              </pre>
              <p>After</p>
              <pre className="whitespace-pre-wrap break-words font-sans">
                {c.afterLabel ?? c.after ?? "None"}
              </pre>
            </details>
          ))}
        </article>
      ))}
    </details>
  );
}
