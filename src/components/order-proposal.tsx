"use client";
import type { SupplementalDraft } from "./planning-drafts";
import { button } from "./ui/planner-controls";
export function OrderingProposal({
  draft,
  pending,
  retry,
  discard,
  refresh,
}: {
  draft: SupplementalDraft;
  pending: boolean;
  retry: () => void;
  discard: () => void;
  refresh: () => void;
}) {
  return (
    <section
      aria-label="Unconfirmed ordering"
      className="my-3 space-y-2 rounded border bg-amber-50 p-3"
    >
      <h3 className="font-semibold">Ordering is not confirmed saved</h3>
      <p>
        Saved order is shown until the server confirms the move. Work, comment
        and list input is kept.
      </p>
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <p>
          The sibling order changed. Refresh and review the current order;
          discard this proposal before choosing a new move.
        </p>
      )}
      <button
        type="button"
        className={button}
        disabled={pending || !!draft.conflict}
        onClick={retry}
      >
        Retry same ordering move
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={refresh}
      >
        Refresh sibling order
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={discard}
      >
        Discard ordering proposal
      </button>
      {draft.uncertain && (
        <p>
          A request may already have committed. Discarding input cannot undo it.
          Retrying the same move reconciles its original receipt without
          applying it over a later reorder.
        </p>
      )}
    </section>
  );
}
