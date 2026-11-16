"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { emptyLabelFilter, type LabelFilter } from "@/lib/task-labels";
import type { TaskStatus } from "@/lib/task-statuses";
import { usePlannerSession } from "./planner-session";
import { emptyBoardFilters, type BoardFilters } from "@/lib/board-filters";
import type { CalendarDraft } from "@/lib/calendar-draft";
import type { EntityTarget } from "./entity-editor";
import type { ProjectRecord, TaskRecord } from "@/lib/planning-contracts";
import type { TrashImpact, TrashBatchRecord } from "@/lib/trash-contracts";

export type TrashMoveDraft = {
  target: EntityTarget;
  impact: TrashImpact;
  requestKey: string;
  uncertain: boolean;
  error?: string;
  changed?: boolean;
};
export type TrashRestoreDraft = {
  workspaceId: string;
  batch: TrashBatchRecord;
  uncertain: boolean;
  error?: string;
  requires?: string;
  statusResolution?: import("@/lib/trash-contracts").RestoreStatusResolution;
  statusReplacements?: Record<string, string>;
};

export type SupplementalDraft = {
  workspaceId: string;
  orderScope?: string;
  target?: EntityTarget;
  label: string;
  form?:
    | "list"
    | "item-checklist"
    | "item-shopping"
    | "vendor"
    | "workflow"
    | "order"
    | "tag-remove"
    | "tag";
  tagRemoval?: import("@/lib/tag-contracts").TagRemovalPreview;
  path: string;
  method: "POST" | "PATCH";
  values: Record<string, unknown>;
  uncertain?: boolean;
  error?: string;
  conflict?: Record<string, unknown>;
};
export type CommentDraft = {
  target: EntityTarget;
  text: string;
  requestKey: string;
  commentId?: string;
  revision?: number;
  uncertain?: boolean;
  conflict?: import("@/lib/activity-contracts").CommentRecord;
  error?: string;
};
export function commentScope(target: EntityTarget) {
  return `${target.workspaceId}/${target.kind}/${target.record!.id}/comments/`;
}
export function activityLock(target: EntityTarget) {
  return `activity:${target.workspaceId}/${target.kind}/${target.record!.id}`;
}
export type PlanningDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  tagIds?: string[];
  revision: number;
  dirty: boolean;
  target?: EntityTarget;
  conflict?: ProjectRecord | TaskRecord;
  projectId?: string | null;
  uncertain?: boolean;
};
type DraftStore = {
  viewLabels: { projects: LabelFilter; calendar: LabelFilter };
  setViewLabels: Dispatch<
    SetStateAction<{ projects: LabelFilter; calendar: LabelFilter }>
  >;
  supplementalDrafts: Record<string, SupplementalDraft>;
  setSupplementalDrafts: Dispatch<
    SetStateAction<Record<string, SupplementalDraft>>
  >;
  commentDrafts: Record<string, CommentDraft>;
  setCommentDrafts: Dispatch<SetStateAction<Record<string, CommentDraft>>>;
  trashMoves: Record<string, TrashMoveDraft>;
  setTrashMoves: Dispatch<SetStateAction<Record<string, TrashMoveDraft>>>;
  trashRestores: Record<string, TrashRestoreDraft>;
  setTrashRestores: Dispatch<SetStateAction<Record<string, TrashRestoreDraft>>>;
  retireWork: (
    workspaceId: string,
    rows: { kind: "project" | "task"; id: string }[],
  ) => void;
  boardFilters: BoardFilters;
  setBoardFilters: Dispatch<SetStateAction<BoardFilters>>;
  expansion: Record<string, boolean>;
  setExpansion: Dispatch<SetStateAction<Record<string, boolean>>>;
  calendarDrafts: Record<string, CalendarDraft>;
  setCalendarDrafts: Dispatch<SetStateAction<Record<string, CalendarDraft>>>;
  drafts: Record<string, PlanningDraft>;
  setDrafts: Dispatch<SetStateAction<Record<string, PlanningDraft>>>;
  prepareSignOut: () => void;
  savingKeys: string[];
  saveEpoch: number;
  beginSave: (key: string) => boolean;
  finishSave: (key: string, saved: boolean) => void;
};
const Context = createContext<DraftStore | null>(null);

// Lives above planner routes, only in memory. Full sign-out/sign-in navigation or
// a changed authenticated-user key discards it. No browser storage/offline queue.
export function PlanningDrafts({ children }: { children: React.ReactNode }) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const [viewLabels, setViewLabels] = useState({
    projects: { ...emptyLabelFilter },
    calendar: { ...emptyLabelFilter },
  });
  const [supplementalDrafts, setSupplementalDrafts] = useState<
    Record<string, SupplementalDraft>
  >({});
  const [commentDrafts, setCommentDrafts] = useState<
    Record<string, CommentDraft>
  >({});
  const [drafts, setDrafts] = useState<Record<string, PlanningDraft>>({});
  const [trashMoves, setTrashMoves] = useState<Record<string, TrashMoveDraft>>(
    {},
  );
  const [trashRestores, setTrashRestores] = useState<
    Record<string, TrashRestoreDraft>
  >({});
  const [calendarDrafts, setCalendarDrafts] = useState<
    Record<string, CalendarDraft>
  >({});
  const [boardFilters, setBoardFilters] =
    useState<BoardFilters>(emptyBoardFilters);
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const documentExitAllowed = useRef(false);
  const dirty =
    Object.keys(supplementalDrafts).length > 0 ||
    Object.keys(commentDrafts).length > 0 ||
    [...Object.values(drafts), ...Object.values(calendarDrafts)].some(
      (draft) => draft.dirty,
    ) ||
    Object.keys(trashMoves).length > 0 ||
    Object.keys(trashRestores).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!documentExitAllowed.current && !session.isLeaving()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, session]);
  useEffect(
    () =>
      session.onInvalidate(() => {
        documentExitAllowed.current = true;
        inFlight.current.clear();
        setDrafts({});
        setCommentDrafts({});
        setSupplementalDrafts({});
        setViewLabels({
          projects: { ...emptyLabelFilter },
          calendar: { ...emptyLabelFilter },
        });
        setCalendarDrafts({});
        setTrashMoves({});
        setTrashRestores({});
        setSavingKeys([]);
        setSaveEpoch(0);
        setExpansion({});
        setBoardFilters(emptyBoardFilters);
      }),
    [session],
  );
  const updateDrafts: DraftStore["setDrafts"] = (value) => {
    if (session.isCurrent(lease)) setDrafts(value);
  };
  function prepareSignOut() {
    documentExitAllowed.current = true;
    setDrafts({});
    setCommentDrafts({});
    setSupplementalDrafts({});
    setViewLabels({
      projects: { ...emptyLabelFilter },
      calendar: { ...emptyLabelFilter },
    });
    setCalendarDrafts({});
    setTrashMoves({});
    setTrashRestores({});
  }
  function beginSave(key: string) {
    if (!session.isCurrent(lease)) return false;
    const targetKey = (value: string) =>
      value.replace(/^(activity:|trash:)/, "");
    if (
      [...inFlight.current].some((value) => targetKey(value) === targetKey(key))
    )
      return false;
    inFlight.current.add(key);
    setSavingKeys([...inFlight.current]);
    return true;
  }
  function finishSave(key: string, saved: boolean) {
    if (!session.isCurrent(lease)) return;
    inFlight.current.delete(key);
    setSavingKeys([...inFlight.current]);
    // A form may have unmounted while its request completed. Current views must
    // still fetch that committed record; drafts never move to the new context.
    if (saved) setSaveEpoch((current) => current + 1);
  }
  return (
    <Context.Provider
      value={{
        viewLabels,
        setViewLabels: (value) => {
          if (session.isCurrent(lease)) setViewLabels(value);
        },
        supplementalDrafts,
        setSupplementalDrafts: (value) => {
          if (session.isCurrent(lease)) setSupplementalDrafts(value);
        },
        commentDrafts,
        setCommentDrafts: (value) => {
          if (session.isCurrent(lease)) setCommentDrafts(value);
        },
        trashMoves,
        setTrashMoves: (value) => {
          if (session.isCurrent(lease)) setTrashMoves(value);
        },
        trashRestores,
        setTrashRestores: (value) => {
          if (session.isCurrent(lease)) setTrashRestores(value);
        },
        retireWork: (workspaceId, rows) => {
          if (!session.isCurrent(lease)) return;
          const projects = new Set(
            rows.filter((row) => row.kind === "project").map((row) => row.id),
          );
          const tasks = new Set(
            rows.filter((row) => row.kind === "task").map((row) => row.id),
          );
          setDrafts((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([key, draft]) => {
                if (!key.startsWith(workspaceId + "/")) return true;
                const target = draft.target,
                  record = target?.record;
                const projectId =
                  record && "projectId" in record
                    ? record.projectId
                    : (draft.projectId ?? target?.projectId);
                const parentId =
                  record && "parentId" in record
                    ? record.parentId
                    : target?.parentId;
                return record
                  ? !(target?.kind === "projects" ? projects : tasks).has(
                      record.id,
                    )
                  : !(projectId && projects.has(projectId)) &&
                      !(parentId && tasks.has(parentId));
              }),
            ),
          );
        },
        boardFilters,
        setBoardFilters,
        expansion,
        setExpansion,
        calendarDrafts,
        setCalendarDrafts: (value) => {
          if (session.isCurrent(lease)) setCalendarDrafts(value);
        },
        drafts,
        setDrafts: updateDrafts,
        prepareSignOut,
        savingKeys,
        saveEpoch,
        beginSave,
        finishSave,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePlanningDrafts() {
  const value = useContext(Context);
  if (!value) throw new Error("Planning drafts require a signed-in planner");
  return value;
}
