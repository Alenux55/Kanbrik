"use client";
import type { SupplementalDraft } from "./planning-drafts";
import { button } from "./ui/planner-controls";
export function TagRemovalForm({
  draft,
  pending,
  save,
  download,
  refresh,
  discard,
}: {
  draft: SupplementalDraft;
  pending: boolean;
  save: () => void;
  download: () => void;
  refresh: () => void;
  discard: () => void;
}) {
  const report = draft.tagRemoval;
  if (!report)
    return (
      <p role="alert">
        Removal review unavailable. Keep other drafts and review this tag again.
      </p>
    );
  return (
    <section aria-label="Remove tag" className="space-y-3">
      <h3 className="text-xl font-semibold">Remove {report.tagName}?</h3>
      <p>
        {report.activeCount + report.trashCount
          ? `This tag is used by ${report.activeCount} active and ${report.trashCount} trashed tasks/subtasks across this workspace.`
          : "This tag has no task assignments."}
      </p>
      <p>
        Remove will detach only this tag from every listed task and archive its
        definition. Work, other tags and history are kept. Trash batches will be
        updated so refreshed Restore remains available.
      </p>
      <p>
        Restoring the definition does not retag former tasks. Use the preserved
        removal report to reattach selected tags through normal editors; restore
        work from Trash first.
      </p>
      <p className="break-all text-sm">
        Review {report.impactDigest} · captured {report.capturedAt}. Downloading
        does not lock this snapshot; changed work requires a new review.
      </p>
      <button
        className={button}
        type="button"
        disabled={pending || !!draft.conflict || !!draft.uncertain}
        onClick={download}
      >
        Download usage list
      </button>
      <p>
        Complete usage: {report.rows.length} tasks/subtasks. All workspace
        projects and Trash are included, independent of planner filters.
      </p>
      <ul
        aria-label="Reviewed tag usage"
        className="max-h-64 space-y-2 overflow-auto"
      >
        {report.rows.map((r) => (
          <li key={r.taskId} className="break-words rounded border p-2">
            {r.title} · {r.type} · {r.project || "No project"}
            {r.parent ? ` / ${r.parent}` : ""} · {r.status} · {r.state}
            <span className="block text-sm">{r.taskId}</span>
          </li>
        ))}
      </ul>
      {draft.uncertain && (
        <p role="status">
          Removal is unconfirmed. Retry the same operation to reconcile it; this
          will not detach later assignments again.
        </p>
      )}
      {draft.error && <p role="alert">{draft.error}</p>}
      {!!draft.conflict && (
        <p role="alert">
          The reviewed impact changed. Nothing from this request was removed.
          Your original review is kept; review the latest impact before
          confirming again.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          type="button"
          disabled={pending || !!draft.conflict}
          onClick={save}
        >
          {pending
            ? "Working…"
            : draft.uncertain
              ? "Retry tag removal"
              : report.rows.length
                ? "Remove anyway"
                : "Remove unused tag"}
        </button>
        {!draft.uncertain && (
          <button
            className={button}
            type="button"
            disabled={pending}
            onClick={refresh}
          >
            Review latest impact
          </button>
        )}
        <button
          className={button}
          type="button"
          disabled={pending}
          onClick={discard}
        >
          Cancel tag removal
        </button>
      </div>
    </section>
  );
}
