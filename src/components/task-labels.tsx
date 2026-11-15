"use client";
import { useEffect, useRef, useState } from "react";
import type { LabelFilter } from "@/lib/task-labels";
import { emptyLabelFilter } from "@/lib/task-labels";
import type { TagRecord } from "@/lib/tag-contracts";
import { tagColor } from "@/lib/project-palette";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { button, control } from "./ui/planner-controls";
export function TaskLabelBadges({ task }: { task: { tags?: TagRecord[] } }) {
  return (
    <span className="inline-flex max-w-full flex-wrap gap-1">
      {task.tags?.map((tag) => (
        <span
          key={tag.id}
          className="max-w-full break-words rounded border border-neutral-500 px-1 text-xs text-neutral-950"
          style={{ backgroundColor: tagColor(tag.color) }}
        >
          {tag.name}
          {tag.archivedAt ? " (archived)" : ""}
        </span>
      ))}
    </span>
  );
}
export function TaskLabelFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: LabelFilter;
  onChange: (value: LabelFilter) => void;
  disabled?: boolean;
}) {
  const context = usePlannerContext(),
    session = usePlannerSession(),
    store = usePlanningDrafts(),
    [lease] = useState(session.capture),
    [tags, setTags] = useState<TagRecord[]>([]),
    [error, setError] = useState("");
  const handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  useEffect(() => {
    let active = true;
    Promise.all(
      context.workspaces.map(async (w) => {
        const r = await session.fetch(`/api/workspaces/${w.id}/tags`);
        if (r.status === 404) {
          if (active && session.isCurrent(lease)) handlers.current.revoke(w.id);
          return [];
        }
        if (!r.ok) throw Error();
        return (await r.json()) as TagRecord[];
      }),
    )
      .then((rows) => {
        if (active && session.isCurrent(lease)) {
          setTags(rows.flat());
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setTags([]);
          setError(
            "Tag choices incomplete. Current filter is kept; refresh this view to retry.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [session, lease, context.workspaces, store.saveEpoch]);
  return (
    <fieldset
      aria-label="Task tag filters"
      disabled={disabled}
      className="my-3 min-w-0 space-y-2 rounded border p-3"
    >
      <legend className="font-semibold">Task tags</legend>
      {error && <p role="alert">{error}</p>}
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {tags
          .filter((tag) =>
            context.workspaces.some((w) => w.id === tag.workspaceId),
          )
          .map((tag) => (
            <label
              key={tag.id}
              className="inline-flex min-h-11 max-w-full items-center gap-2 break-words"
            >
              <input
                type="checkbox"
                checked={value.tagIds.includes(tag.id)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    tagIds: e.target.checked
                      ? [...value.tagIds, tag.id]
                      : value.tagIds.filter((id) => id !== tag.id),
                    tagScopes: {
                      ...value.tagScopes,
                      [tag.id]: tag.workspaceId,
                    },
                  })
                }
              />
              <span
                style={{ backgroundColor: tagColor(tag.color) }}
                className="rounded px-1 text-neutral-950"
              >
                {tag.name}
              </span>{" "}
              ({context.workspaces.find((w) => w.id === tag.workspaceId)?.name})
              {tag.archivedAt ? " — archived" : ""}
            </label>
          ))}
      </div>
      <label className="block">
        Match selected tags
        <select
          className={control}
          aria-label="Match selected tags"
          value={value.matchAll ? "all" : "any"}
          onChange={(e) =>
            onChange({ ...value, matchAll: e.target.value === "all" })
          }
        >
          <option value="any">Any selected (OR)</option>
          <option value="all">All selected (AND)</option>
        </select>
      </label>
      <p className="text-sm">
        Each task matches selected tags in its own workspace. Workspaces with no
        selected tags are excluded while filtering.
      </p>
      <button
        type="button"
        className={button}
        onClick={() =>
          onChange({
            ...emptyLabelFilter,
            projects: value.projects,
            search: value.search,
          })
        }
      >
        Clear tag filters
      </button>
    </fieldset>
  );
}
