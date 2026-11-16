"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { LabelFilter } from "@/lib/task-labels";
import type { TagRecord } from "@/lib/tag-contracts";
import { dateBounds } from "@/lib/board-filters";
import { ownDialogHistory } from "@/lib/dialog-history";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { button, control } from "./ui/planner-controls";

type Choice = { id: string; title: string };
function Checklist({
  name,
  choices,
  selected,
  change,
  error,
  disabled,
}: {
  name: string;
  choices: Choice[];
  selected: string[];
  change: (ids: string[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const id = useId(),
    session = usePlannerSession(),
    [lease] = useState(session.capture);
  useLayoutEffect(() => {
    if (!open) return;
    search.current?.focus();
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: Math.max(
            12,
            Math.min(rect.bottom + 4, window.innerHeight - 350),
          ),
          left: Math.max(16, Math.min(rect.left, window.innerWidth - 304)),
        });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const close = () => {
      setOpen(false);
      trigger.current?.focus();
    };
    const release = ownDialogHistory(
      id,
      () => session.isCurrent(lease) && !session.isLeaving(),
      () => {
        close();
        return false;
      },
    );
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      // Keep the listener until click so a real link can await removal of the
      // popup's same-URL history entry before Next starts route navigation.
      if (!root.current?.contains(target) && !target.closest("a[href]"))
        setOpen(false);
    };
    let navigating = false,
      replaying = false;
    const followLink = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        root.current?.contains(anchor) ||
        replaying ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (navigating) return;
      navigating = true;
      void release().then(() => {
        setOpen(false);
        if (
          session.isCurrent(lease) &&
          session.getSnapshot().phase === "ready" &&
          anchor.isConnected
        ) {
          replaying = true;
          anchor.click();
        }
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("click", followLink, true);
    document.addEventListener("keydown", escape, true);
    const unsubscribe = session.subscribe(() => {
      if (session.getSnapshot().phase !== "ready") setOpen(false);
    });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      void release();
      unsubscribe();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("click", followLink, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, id, session, lease]);
  const visible = choices.filter((choice) =>
    choice.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      ref={root}
      className="relative col-span-2 min-w-0"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node) &&
          !(
            event.relatedTarget instanceof Element &&
            event.relatedTarget.closest("a[href]")
          )
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={button + " w-full"}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          setQuery("");
          setOpen((value) => !value);
        }}
      >
        {name}
        {selected.length ? ` (${selected.length})` : ""}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={`${name} filters`}
          style={position}
          className="fixed z-40 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 shadow-lg"
        >
          <input
            ref={search}
            aria-label={`Find ${name.toLowerCase()}`}
            placeholder={`Find ${name.toLowerCase()}`}
            className={control}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <div
            className="max-h-56 overflow-y-auto overscroll-contain"
            role="group"
            aria-label={`${name} choices`}
          >
            {visible.map((choice) => (
              <label
                key={choice.id}
                className="flex min-h-11 items-center gap-2 break-words [overflow-wrap:anywhere]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(choice.id)}
                  onChange={(event) =>
                    change(
                      event.target.checked
                        ? [...selected, choice.id]
                        : selected.filter((id) => id !== choice.id),
                    )
                  }
                />
                <span className="min-w-0">{choice.title}</span>
              </label>
            ))}
            {!visible.length && (
              <p className="py-3 text-sm">No choices found.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => change([])}>
              Clear selection
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlannerFilters({
  value,
  change,
  projects,
  workspaceIds,
  advanced,
  advancedCount,
  placeholder,
  disabled,
  projectError,
  refreshKey = 0,
}: {
  value: LabelFilter;
  change: (value: LabelFilter) => void;
  projects: Choice[];
  workspaceIds: string[];
  advanced: () => void;
  advancedCount: number;
  placeholder: string;
  disabled?: boolean;
  projectError?: string;
  refreshKey?: number;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts(),
    [lease] = useState(session.capture);
  const [loaded, setLoaded] = useState<{
    key: string;
    tags: TagRecord[];
    error: string;
  }>({ key: "", tags: [], error: "" });
  const key = workspaceIds
    .filter((id) => context.workspaces.some((workspace) => workspace.id === id))
    .sort()
    .join(",");
  const handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  useEffect(() => {
    let active = true;
    const ids = key ? key.split(",") : [];
    Promise.all(
      ids.map(async (id) => {
        const response = await session.fetch(`/api/workspaces/${id}/tags`);
        if (response.status === 404) {
          if (active && session.isCurrent(lease)) handlers.current.revoke(id);
          return [];
        }
        if (!response.ok) throw Error();
        return (await response.json()) as TagRecord[];
      }),
    )
      .then((rows) => {
        if (active && session.isCurrent(lease))
          setLoaded({ key, tags: rows.flat(), error: "" });
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setLoaded({
            key,
            tags: [],
            error: "Tag choices incomplete. Filters kept; refresh to retry.",
          });
      });
    return () => {
      active = false;
    };
  }, [key, session, lease, store.saveEpoch, refreshKey]);
  const tags = loaded.key === key ? loaded.tags : [];
  const choices = tags.map((tag) => ({
    id: tag.id,
    title: `${tag.name} (${context.workspaces.find((w) => w.id === tag.workspaceId)?.name ?? "Workspace"})${tag.archivedAt ? " — archived" : ""}`,
  }));
  const missing =
    value.tagIds.some((id) => !tags.some((tag) => tag.id === id)) ||
    value.projects?.some(
      (id) =>
        id !== "standalone" && !projects.some((project) => project.id === id),
    );
  return (
    <div className="my-3 min-w-0" aria-label="Planner filters">
      <div className="grid min-w-0 grid-cols-6 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <Checklist
          name="Project"
          choices={[{ id: "standalone", title: "Standalone" }, ...projects]}
          selected={value.projects ?? []}
          change={(projects) => change({ ...value, projects })}
          error={projectError}
          disabled={disabled}
        />
        <Checklist
          name="Tags"
          choices={choices}
          selected={value.tagIds}
          change={(tagIds) =>
            change({
              ...value,
              tagIds,
              tagScopes: {
                ...value.tagScopes,
                ...Object.fromEntries(
                  tags.map((tag) => [tag.id, tag.workspaceId]),
                ),
              },
            })
          }
          error={loaded.key === key ? loaded.error : "Loading tag choices…"}
          disabled={disabled}
        />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          className={
            control +
            " order-4 col-span-4 !mt-0 lg:order-none lg:!w-auto lg:flex-1"
          }
          value={value.search ?? ""}
          disabled={disabled}
          onChange={(event) => change({ ...value, search: event.target.value })}
        />
        <button
          type="button"
          className={button + " order-3 col-span-2 lg:order-none"}
          disabled={disabled}
          onClick={advanced}
        >
          Advanced{advancedCount ? ` (${advancedCount})` : ""}
        </button>
        <button
          type="button"
          className={button + " order-5 col-span-2 lg:order-none"}
          disabled={disabled}
          onClick={() =>
            change({
              ...value,
              projects: [],
              tagIds: [],
              tagScopes: {},
              search: "",
              matchAll: false,
              createdFrom: "",
              createdTo: "",
              editedFrom: "",
              editedTo: "",
              ...("hideDone" in value ? { hideDone: false } : {}),
            })
          }
        >
          Clear filters
        </button>
      </div>
      {loaded.key === key && !loaded.error && !projectError && missing && (
        <p className="mt-1 text-sm">
          Some selections are unavailable in this scope. Clear filters to show
          available work.
        </p>
      )}
    </div>
  );
}

export function TagMatchControl({
  value,
  change,
}: {
  value: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <label className="block">
      Match selected tags
      <select
        className={control}
        aria-label="Match selected tags"
        value={value ? "all" : "any"}
        onChange={(event) => change(event.target.value === "all")}
      >
        <option value="any">Any selected (OR)</option>
        <option value="all">All selected (AND)</option>
      </select>
      <span className="text-sm">
        Each task uses only selected tags from its own workspace.
      </span>
    </label>
  );
}
export const dateFields = [
  ["createdFrom", "Created from"],
  ["createdTo", "Created through"],
  ["editedFrom", "Edited from"],
  ["editedTo", "Edited through"],
] as const;
export function advancedCount(value: LabelFilter & { hideDone?: boolean }) {
  return (
    dateFields.filter(([key]) => value[key]).length +
    Number(value.matchAll) +
    Number(!!value.hideDone)
  );
}
export function validFilterDates(value: LabelFilter, zone: string) {
  return (
    !!dateBounds(value.createdFrom ?? "", value.createdTo ?? "", zone) &&
    !!dateBounds(value.editedFrom ?? "", value.editedTo ?? "", zone)
  );
}
export function FilterDates({
  value,
  change,
  zone,
}: {
  value: LabelFilter;
  change: (key: (typeof dateFields)[number][0], value: string) => void;
  zone: string;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {dateFields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="date"
              className={control}
              value={value[key] ?? ""}
              onChange={(event) => change(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="text-sm">
        Inclusive days in {zone}. Last edited includes status changes, not
        scheduling.
      </p>
      {!validFilterDates(value, zone) && (
        <p role="alert">Enter valid dates with From no later than Through.</p>
      )}
    </>
  );
}
