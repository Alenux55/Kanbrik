"use client";
import { useEffect, useState } from "react";
import type { TaskRecord } from "@/lib/planning-contracts";
import type { TaskOrderRecord } from "@/lib/task-order-contracts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { EditorDialog } from "./ui/editor-dialog";
import { OrderingProposal } from "./order-proposal";
export {
  orderRows,
  SiblingOrderGroup,
  SiblingOrderRow,
} from "./sibling-order-group";
export function OrderReviewDialog({
  draftKey,
  close,
}: {
  draftKey: string;
  close: () => void;
}) {
  const store = usePlanningDrafts(),
    draft = store.supplementalDrafts[draftKey],
    session = usePlannerSession(),
    context = usePlannerContext(),
    [lease] = useState(session.capture),
    [data, setData] = useState<{
      scope: TaskOrderRecord;
      tasks: TaskRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const mutation = useSupplementalMutation(close);
  const workspaceId = draft?.workspaceId,
    scopeKey = draft?.orderScope;
  useEffect(() => {
    let active = true;
    if (!workspaceId || !scopeKey) return;
    Promise.all([
      session.fetch(`/api/workspaces/${workspaceId}/task-order`),
      session.fetch(`/api/workspaces/${workspaceId}/tasks`),
    ])
      .then(async (responses) => {
        if (!active || !session.isCurrent(lease)) return;
        if (responses.some((r) => r.status === 404)) {
          context.revoke(workspaceId);
          return;
        }
        if (responses.some((r) => !r.ok)) throw Error();
        const [orders, tasks] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (active && session.isCurrent(lease)) {
          const scope = orders.find(
            (s: TaskOrderRecord) => s.scopeKey === scopeKey,
          );
          if (!scope) throw Error();
          setData({ scope, tasks });
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setData(null);
          setError(
            "Order unavailable. The proposal is kept; refresh before choosing another move.",
          );
        }
      });
    return () => {
      active = false;
    };
    // The scoped account/workspace callbacks are guarded above; draft values are never rebased by a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lease, workspaceId, scopeKey, epoch]);
  if (!draft || !workspaceId) return null;
  const pending = store.savingKeys.includes(`order:${workspaceId}/${scopeKey}`);
  return (
    <EditorDialog
      title="Review sibling ordering"
      dirty
      pending={pending}
      discard={() => mutation.discard(draftKey)}
      close={close}
    >
      <p>{draft.label}</p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <ol className="list-inside list-decimal">
          {data.scope.ids.map((id) => (
            <li key={id}>
              {data.tasks.find((t) => t.id === id)?.title ?? "Unavailable task"}
            </li>
          ))}
        </ol>
      )}
      <OrderingProposal
        draft={draft}
        pending={pending}
        retry={() => void mutation.run(draftKey, draft)}
        discard={() => {
          mutation.discard(draftKey);
          close();
        }}
        refresh={() => setEpoch((x) => x + 1)}
      />
    </EditorDialog>
  );
}
