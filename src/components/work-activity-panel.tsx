"use client";
import { useEffect, useId, useRef, useState } from "react";
import { DateTime } from "luxon";
import type {
  ActivityPage,
  ActivityRecord,
  CommentRecord,
  FieldChange,
} from "@/lib/activity-contracts";
import { taskStatusLabels, type TaskStatus } from "@/lib/task-statuses";
import type { EntityTarget } from "./entity-editor";
import {
  activityLock,
  commentScope,
  usePlanningDrafts,
  type CommentDraft,
} from "./planning-drafts";
import { usePlannerContext } from "./planner-context";
import { usePlannerSession } from "./planner-session";
import { button, control } from "./ui/planner-controls";

const actions: Record<string, string> = {
  work_created: "Created work",
  work_updated: "Edited work",
  status_changed: "Changed status",
  work_trashed: "Moved to Trash",
  work_restored: "Restored work",
  comment_created: "Posted comment",
  comment_edited: "Edited comment",
  list_created: "Added list",
  list_updated: "Edited list",
  item_created: "Added list item",
  item_updated: "Edited list item",
  task_reordered: "Reordered task",
};
const fields: Record<FieldChange["field"], string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  text: "Comment",
  deletedAt: "Trash date",
  tags:"Tags",important:"Important",urgent:"Urgent",
};
export function WorkActivityPanel({
  target,
  readOnly = false,
  blocked = false,
  onReadOnly,
}: {
  target: EntityTarget;
  readOnly?: boolean;
  blocked?: boolean;
  onReadOnly?: (readOnly: boolean) => void;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const [comments, setComments] = useState<ActivityPage<CommentRecord> | null>(
    null,
  );
  const [history, setHistory] = useState<ActivityPage<ActivityRecord> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const generation = useRef(0),
    alive = useRef(true),
    busy = useRef(false);
  const handlers = useRef({ revoke: context.revoke, onReadOnly });
  useEffect(() => {
    handlers.current = { revoke: context.revoke, onReadOnly };
  });
  const scope = commentScope(target),
    lock = activityLock(target);
  const base = `/api/workspaces/${target.workspaceId}/${target.kind}/${target.record!.id}`;
  const pending = store.savingKeys.includes(lock);
  const paused = readOnly || !!comments?.readOnly;
  const inputBlocked = blocked || pending || loading || !comments || !!error;
  function stamp(value: string) {
    return (
      <time dateTime={value} title={value}>
        {DateTime.fromISO(value, { zone: "utc" })
          .setZone(context.zone)
          .toFormat("yyyy-LL-dd HH:mm:ss ZZZZ (ZZ)")}{" "}
        ({context.zone})
      </time>
    );
  }
  useEffect(() => {
    let active = true;
    alive.current = true;
    const seq = ++generation.current;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const responses = await Promise.all([
          session.fetch(base + "/comments"),
          session.fetch(base + "/history"),
        ]);
        if (!active || seq !== generation.current || !session.isCurrent(lease))
          return;
        if (responses.some((r) => r.status === 404)) {
          const access = await session.fetch(
            `/api/workspaces/${target.workspaceId}`,
          );
          if (
            !active ||
            seq !== generation.current ||
            !session.isCurrent(lease)
          )
            return;
          if (access.status === 404) {
            handlers.current.revoke(target.workspaceId);
            return;
          }
        }
        if (responses.some((r) => !r.ok)) throw new Error();
        const [nextComments, nextHistory] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (!active || seq !== generation.current || !session.isCurrent(lease))
          return;
        setComments(nextComments);
        setHistory(nextHistory);
        handlers.current.onReadOnly?.(nextComments.readOnly);
      } catch {
        if (active && seq === generation.current && session.isCurrent(lease)) {
          setComments(null);
          setHistory(null);
          setError(
            "Activity unavailable or incomplete. Your drafts are kept. Refresh activity to check access and saved data.",
          );
        }
      } finally {
        if (active && seq === generation.current && session.isCurrent(lease))
          setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      alive.current = false;
    };
  }, [base, target.workspaceId, session, lease, epoch]);
  async function more(kind: "comments" | "history") {
    const page = kind === "comments" ? comments : history;
    if (!page?.nextCursor || loading || busy.current) return;
    busy.current = true;
    setLoading(true);
    const seq = generation.current;
    try {
      const response = await session.fetch(
        `${base}/${kind}?cursor=${encodeURIComponent(page.nextCursor)}`,
      );
      if (!response.ok) {
        if (response.status === 404) {
          const access = await session.fetch(
            `/api/workspaces/${target.workspaceId}`,
          );
          if (
            alive.current &&
            seq === generation.current &&
            session.isCurrent(lease) &&
            access.status === 404
          )
            handlers.current.revoke(target.workspaceId);
        }
        throw new Error();
      }
      const result = await response.json();
      if (
        !alive.current ||
        seq !== generation.current ||
        !session.isCurrent(lease)
      )
        return;
      if (kind === "comments")
        setComments(
          (current) =>
            current && {
              ...result,
              items: [...current.items, ...result.items],
            },
        );
      else
        setHistory(
          (current) =>
            current && {
              ...result,
              items: [...current.items, ...result.items],
            },
        );
      setComments(
        (current) => current && { ...current, readOnly: result.readOnly },
      );
      handlers.current.onReadOnly?.(result.readOnly);
    } catch {
      if (
        alive.current &&
        seq === generation.current &&
        session.isCurrent(lease)
      ) {
        setComments(null);
        setHistory(null);
        setError(
          "Activity continuation failed. Lists are incomplete; refresh activity. Drafts are kept.",
        );
      }
    } finally {
      busy.current = false;
      if (
        alive.current &&
        seq === generation.current &&
        session.isCurrent(lease)
      )
        setLoading(false);
    }
  }
  function discard(key: string) {
    store.setCommentDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function change(key: string, values: Partial<CommentDraft>) {
    store.setCommentDrafts((current) =>
      current[key]
        ? { ...current, [key]: { ...current[key], ...values } }
        : current,
    );
  }
  function start(comment?: CommentRecord) {
    const key = scope + (comment?.id ?? "new");
    store.setCommentDrafts((current) =>
      current[key]
        ? current
        : {
            ...current,
            [key]: {
              target,
              text: comment?.text ?? "",
              requestKey: crypto.randomUUID(),
              ...(comment
                ? { commentId: comment.id, revision: comment.revision }
                : {}),
            },
          },
    );
  }
  async function save(key: string, draft: CommentDraft) {
    if (
      inputBlocked ||
      draft.conflict ||
      (paused && !(draft.uncertain && !draft.commentId)) ||
      !draft.text.trim() ||
      !store.beginSave(lock)
    )
      return;
    let committed = false;
    change(key, { error: undefined, uncertain: true });
    try {
      const response = await session.fetch(
        base + "/comments" + (draft.commentId ? `/${draft.commentId}` : ""),
        {
          method: draft.commentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            draft.commentId
              ? { text: draft.text, revision: draft.revision }
              : { text: draft.text, requestKey: draft.requestKey },
          ),
        },
      );
      const result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok) {
        discard(key);
        if (alive.current) {
          context.announce("Comment saved. Work drafts are kept.");
          setEpoch((x) => x + 1);
        }
        return;
      }
      if (response.status === 404 || response.status === 403) {
        const access = await session.fetch(
          `/api/workspaces/${target.workspaceId}`,
        );
        if (!session.isCurrent(lease)) return;
        if (access.status === 404) {
          handlers.current.revoke(target.workspaceId);
          return;
        }
      }
      change(key, {
        uncertain: response.status >= 500,
        conflict:
          response.status === 409 && result.current
            ? result.current
            : undefined,
        error:
          result.error ?? "Comment not confirmed saved. Your input is kept.",
      });
      if (alive.current && response.status === 409 && !result.current)
        setEpoch((x) => x + 1);
    } catch {
      if (session.isCurrent(lease))
        change(key, {
          error:
            "Comment save is unconfirmed. Input is frozen for a safe retry; discard only after checking saved comments.",
        });
    } finally {
      store.finishSave(lock, committed);
    }
  }
  const drafts = Object.entries(store.commentDrafts).filter(([key]) =>
    key.startsWith(scope),
  );
  return (
    <section
      aria-label="Work activity"
      className="mt-6 min-w-0 space-y-5 border-t pt-4 [overflow-wrap:anywhere]"
    >
      <button
        type="button"
        className={button}
        disabled={loading || pending || blocked}
        onClick={() => setEpoch((x) => x + 1)}
      >
        Refresh activity
      </button>
      {loading && <p role="status">Loading activity...</p>}
      {error && <p role="alert">{error}</p>}
      {paused && (
        <p>
          Comments are read-only in Trash. Restore the work before posting or
          editing. Retained drafts are paused.
        </p>
      )}
      <section aria-label="Comments" className="space-y-3">
        <h3 className="text-lg font-semibold">Comments</h3>
        {comments && !comments.items.length && <p>No saved comments.</p>}
        {comments?.items.map((comment) => (
          <article
            key={comment.id}
            aria-label={`Comment by ${comment.author.name}`}
            className="min-w-0 rounded border p-3"
          >
            <p className="font-semibold">
              {comment.author.name}
              {!comment.author.available && " (account unavailable)"}
            </p>
            <p className="text-sm">Posted {stamp(comment.createdAt)}</p>
            {comment.editedAt && (
              <p className="text-sm">Edited {stamp(comment.editedAt)}</p>
            )}
            <p className="whitespace-pre-wrap">{comment.text}</p>
            {comment.author.isYou && !paused && (
              <button
                type="button"
                className={button}
                disabled={inputBlocked}
                onClick={() => start(comment)}
              >
                Edit comment
              </button>
            )}
          </article>
        ))}
        {comments?.nextCursor && (
          <button
            type="button"
            className={button}
            disabled={loading || pending || blocked}
            onClick={() => void more("comments")}
          >
            Load more comments
          </button>
        )}
        {!readOnly &&
          drafts.map(([key, draft]) => (
            <CommentForm
              key={key}
              draft={draft}
              disabled={inputBlocked}
              paused={paused}
              stamp={stamp}
              change={(values) => change(key, values)}
              discard={() => discard(key)}
              // Called only by CommentForm submit, never during render.
              // eslint-disable-next-line react-hooks/refs
              onSave={() => void save(key, draft)}
            />
          ))}
        {!paused && !store.commentDrafts[scope + "new"] && (
          <button
            type="button"
            className={button}
            disabled={inputBlocked}
            onClick={() => start()}
          >
            Add comment
          </button>
        )}
      </section>
      <section aria-label="Edit history" className="space-y-3">
        <h3 className="text-lg font-semibold">Edit history</h3>
        {history && (
          <p className="text-sm">
            Recording available since {stamp(history.availableSince)}.{" "}
            {!history.hasCreationEvent &&
              "Earlier changes and the original creator are unavailable; no past events were reconstructed."}
          </p>
        )}
        {history && !history.items.length && (
          <p>No recorded changes since activity recording began.</p>
        )}
        {history?.items.map((event) => (
          <article key={event.id} className="min-w-0 rounded border p-3">
            <h4 className="font-semibold">
              {actions[event.action] ?? "Work activity"}
            </h4>
            <p>
              {event.actor.name}
              {!event.actor.available && " (account unavailable)"} ·{" "}
              {stamp(event.occurredAt)}
            </p>
            {event.operationId && (
              <p>
                {event.cascade ? "Included in" : "Root of"}{" "}
                {event.action === "work_restored" ? "Restore" : "Trash"}{" "}
                operation: {event.operationTitle} ({event.operationKind}).
              </p>
            )}
            {event.changes.map((field, index) => (
              <details key={index} className="min-w-0 border-t py-2">
                <summary className="min-h-11 cursor-pointer">
                  {field.label ?? fields[field.field] ?? field.field} changed
                </summary>
                <p className="font-semibold">Before</p>
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {value(field, field.before, field.beforeLabel)}
                </pre>
                <p className="font-semibold">After</p>
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {value(field, field.after, field.afterLabel)}
                </pre>
              </details>
            ))}
          </article>
        ))}
        {history?.nextCursor && (
          <button
            type="button"
            className={button}
            disabled={loading || pending || blocked}
            onClick={() => void more("history")}
          >
            Load more history
          </button>
        )}
      </section>
    </section>
  );
}
function value(field: FieldChange, text: string | null, label?: string) {
  if (label !== undefined) return label;
  if (text === null) return "(none)";
  if(field.field==="important"||field.field==="urgent")return text==="true"?"Yes":"No";
  if (text === "") return "(empty)";
  return field.field === "status"
    ? (taskStatusLabels[text as TaskStatus] ?? text)
    : text;
}
function CommentForm({
  draft,
  disabled,
  paused,
  stamp,
  change,
  discard,
  onSave,
}: {
  draft: CommentDraft;
  disabled: boolean;
  paused: boolean;
  stamp: (value: string) => React.ReactNode;
  change: (values: Partial<CommentDraft>) => void;
  discard: () => void;
  onSave: () => void;
}) {
  const id = useId();
  return (
    <form
      aria-label={draft.commentId ? "Edit comment" : "New comment"}
      className="space-y-3 rounded border bg-amber-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <p>
        Unsaved comment draft
        {draft.commentId ? ` (revision ${draft.revision})` : ""}
      </p>
      {draft.uncertain && (
        <p role="status">
          Save unconfirmed. Input is frozen; retry the same request to reconcile
          it.
        </p>
      )}
      <label htmlFor={id}>
        {draft.commentId ? "Edit comment text" : "New comment text"}
      </label>
      <textarea
        id={id}
        className={control + " min-h-28"}
        maxLength={10000}
        required
        value={draft.text}
        disabled={disabled || paused || draft.uncertain}
        onChange={(event) => change({ text: event.target.value })}
      />
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <section aria-label="Saved comment version">
          <p>
            Another edit was saved. Review revision {draft.conflict.revision}.
          </p>
          <p className="whitespace-pre-wrap">{draft.conflict.text}</p>
          <p>
            Posted {stamp(draft.conflict.createdAt)}
            {draft.conflict.editedAt && (
              <> · Edited {stamp(draft.conflict.editedAt)}</>
            )}
          </p>
          <button
            type="button"
            className={button}
            disabled={disabled || paused}
            onClick={discard}
          >
            Discard comment draft
          </button>
          <button
            type="button"
            className={button}
            disabled={disabled || paused}
            onClick={() =>
              change({
                revision: draft.conflict!.revision,
                conflict: undefined,
                error: undefined,
                uncertain: false,
              })
            }
          >
            Review complete: keep comment draft
          </button>
        </section>
      )}
      <button
        className={button}
        disabled={
          disabled ||
          !!draft.conflict ||
          !draft.text.trim() ||
          (paused && !(draft.uncertain && !draft.commentId))
        }
      >
        {draft.uncertain
          ? "Retry comment save"
          : draft.commentId
            ? "Save comment edit"
            : "Post comment"}
      </button>
      <button
        type="button"
        className={button}
        disabled={disabled}
        onClick={discard}
      >
        Discard this comment draft
      </button>
      {draft.uncertain && (
        <p>
          Discarding input does not undo a request that may have committed.
          Refresh activity first.
        </p>
      )}
    </form>
  );
}
