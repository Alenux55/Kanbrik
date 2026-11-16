"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { TagRecord } from "@/lib/tag-contracts";
import { projectPalette, tagColor, themedTint } from "@/lib/project-palette";
import type { EntityTarget } from "./entity-editor";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { EditorNavigationLink } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";

// Assignment only. Definition forms and their retained recovery live in Settings.
export function TaskTagEditor({
  target,
  selected,
  onChange,
}: {
  target: EntityTarget;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture),
    [tags, setTags] = useState<TagRecord[]>([]);
  const [epoch, setEpoch] = useState(0),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    listId = useId();
  const handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  useEffect(() => {
    let alive = true;
    session
      .fetch(`/api/workspaces/${target.workspaceId}/tags`)
      .then(async (r) => {
        if (r.status === 404) {
          const access = await session.fetch(
            `/api/workspaces/${target.workspaceId}`,
          );
          if (alive && session.isCurrent(lease) && access.status === 404)
            handlers.current.revoke(target.workspaceId);
        }
        if (!r.ok) throw Error();
        const rows = await r.json();
        if (alive && session.isCurrent(lease)) {
          setTags(rows);
          setError("");
        }
      })
      .catch(() => {
        if (alive && session.isCurrent(lease))
          setError(
            "Tags unavailable. Your selections are kept. Refresh tags to retry.",
          );
      });
    return () => {
      alive = false;
    };
  }, [session, lease, target.workspaceId, epoch, store.saveEpoch]);
  const suggestions = tags.filter(
    (t) =>
      !t.archivedAt &&
      !selected.includes(t.id) &&
      t.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function choose(tag: TagRecord) {
    onChange([...selected, tag.id]);
    setQuery("");
    setActive(0);
  }
  return (
    <section
      aria-label="Task tags"
      className="min-w-0 space-y-2 rounded border p-3"
    >
      <h3 className="font-semibold">Tags</h3>
      {error && <p role="alert">{error}</p>}
      <ul className="flex flex-wrap gap-2">
        {selected.map((id) => {
          const tag =
            tags.find((t) => t.id === id) ??
            (target.record && "tags" in target.record
              ? target.record.tags?.find((t) => t.id === id)
              : undefined);
          return (
            <li
              key={id}
              className="max-w-full break-words rounded border px-2 py-1"
              style={{
                backgroundColor: themedTint(tagColor(tag?.color ?? "")),
              }}
            >
              {tag?.name ?? "Unavailable selected tag"}
              {tag?.archivedAt ? " (archived)" : ""}
              <button
                className="ml-2 min-h-11 underline"
                type="button"
                onClick={() =>
                  onChange(selected.filter((value) => value !== id))
                }
              >
                Remove {tag?.name ?? "tag"}
              </button>
            </li>
          );
        })}
      </ul>
      <label className="block">
        Find existing tag
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={!!query && !!suggestions.length}
          aria-activedescendant={
            query && suggestions[active]
              ? `${listId}-${suggestions[active].id}`
              : undefined
          }
          className={control}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((value) =>
                Math.max(0, Math.min(value + 1, suggestions.length - 1)),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (query && suggestions[active]) choose(suggestions[active]);
            }
            if (e.key === "Escape" && query) {
              e.preventDefault();
              e.stopPropagation();
              setQuery("");
            }
          }}
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching workspace tags"
        className="max-h-48 overflow-auto"
      >
        {query &&
          suggestions.map((tag, i) => (
            <li
              role="option"
              id={`${listId}-${tag.id}`}
              aria-selected={i === active}
              key={tag.id}
            >
              <button
                type="button"
                className={button + " w-full break-words text-left"}
                style={{ backgroundColor: themedTint(tagColor(tag.color)) }}
                onClick={() => choose(tag)}
              >
                {tag.name} —{" "}
                {projectPalette.find((c) => c.key === tag.color)?.name}
              </button>
            </li>
          ))}
      </ul>
      {query.trim() && !suggestions.length && (
        <p className="text-sm">
          No matching active tags. Create definitions in Settings.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <EditorNavigationLink
          className="inline-flex min-h-11 items-center underline"
          href={`/settings?workspaceId=${encodeURIComponent(target.workspaceId)}#workspace-tags`}
        >
          Create/manage tags
        </EditorNavigationLink>
        <button
          type="button"
          className={button}
          onClick={() => setEpoch((value) => value + 1)}
        >
          Refresh tags
        </button>
      </div>
    </section>
  );
}
