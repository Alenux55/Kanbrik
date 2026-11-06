"use client";
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { TaskStatus } from "@/lib/task-statuses";

export type PlanningDraft = { title: string; description: string; status: TaskStatus; revision: number; dirty: boolean };
type DraftStore = {
  drafts: Record<string, PlanningDraft>; setDrafts: Dispatch<SetStateAction<Record<string, PlanningDraft>>>;
  workspaceId: string; setWorkspaceId: (id: string) => void; prepareSignOut: () => void;
  savingKeys: string[]; saveEpoch: number; beginSave: (key: string) => boolean; finishSave: (key: string, saved: boolean) => void;
};
const Context = createContext<DraftStore | null>(null);

// Lives above planner routes, only in memory. Full sign-out/sign-in navigation or
// a changed authenticated-user key discards it. No browser storage/offline queue.
export function PlanningDrafts({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, PlanningDraft>>({});
  const [workspaceId, setWorkspaceId] = useState("");
  const inFlight = useRef(new Set<string>());
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const documentExitAllowed = useRef(false);
  const dirty = Object.values(drafts).some(draft => draft.dirty);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!documentExitAllowed.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function prepareSignOut() { documentExitAllowed.current = true; setDrafts({}); }
  function beginSave(key: string) {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key); setSavingKeys([...inFlight.current]); return true;
  }
  function finishSave(key: string, saved: boolean) {
    inFlight.current.delete(key); setSavingKeys([...inFlight.current]);
    // A form may have unmounted while its request completed. Current views must
    // still fetch that committed record; drafts never move to the new context.
    if (saved) setSaveEpoch(current => current + 1);
  }
  return <Context.Provider value={{ drafts, setDrafts, workspaceId, setWorkspaceId, prepareSignOut, savingKeys, saveEpoch, beginSave, finishSave }}>{children}</Context.Provider>;
}
export function usePlanningDrafts() {
  const value = useContext(Context);
  if (!value) throw new Error("Planning drafts require a signed-in planner");
  return value;
}
