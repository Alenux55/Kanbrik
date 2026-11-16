"use client";
import { useEffect, useRef, useState } from "react";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import {
  activityLock,
  usePlanningDrafts,
  type SupplementalDraft,
} from "./planning-drafts";
export function useSupplementalMutation(onSaved: () => void) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const alive = useRef(true),
    saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function change(key: string, values: Partial<SupplementalDraft>) {
    store.setSupplementalDrafts((current) =>
      current[key]
        ? { ...current, [key]: { ...current[key], ...values } }
        : current,
    );
  }
  function discard(key: string) {
    store.setSupplementalDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  async function run(key: string, draft: SupplementalDraft) {
    const lock =
      draft.form === "order"
        ? `order:${draft.workspaceId}/${draft.orderScope}`
        : draft.form !== "tag" && draft.target?.record
          ? activityLock(draft.target)
          : "configuration:" + draft.workspaceId;
    if (draft.conflict || !store.beginSave(lock)) return;
    let committed = false;
    change(key, { uncertain: true, error: undefined });
    try {
      const response = await session.fetch(draft.path, {
          method: draft.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft.values),
        }),
        result = await response.json();
      committed = response.ok;
      if (!session.isCurrent(lease)) return;
      if (response.ok) {
        discard(key);
        if (alive.current) {
          context.announce("Saved " + draft.label + ". Other drafts are kept.");
          saved.current();
        }
        return;
      }
      if (response.status === 403 || response.status === 404) {
        const access = await session.fetch(
          `/api/workspaces/${draft.workspaceId}`,
        );
        if (!session.isCurrent(lease)) return;
        if (access.status === 404) {
          context.revoke(draft.workspaceId);
          return;
        }
      }
      change(key, {
        uncertain: response.status >= 500,
        error: result.error ?? "Save not confirmed. Input is kept.",
        conflict:
          response.status === 409 && result.current
            ? result.current
            : undefined,
      });
    } catch {
      if (session.isCurrent(lease))
        change(key, {
          error:
            "Save is unconfirmed. Keep the original input and retry the same request, or refresh before discarding.",
        });
    } finally {
      store.finishSave(lock, committed);
    }
  }
  return { run, change, discard };
}
