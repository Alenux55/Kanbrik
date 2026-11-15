"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { TagRecord } from "@/lib/tag-contracts";
import { projectPalette, tagColor } from "@/lib/project-palette";
import type { EntityTarget } from "./entity-editor";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts, type SupplementalDraft } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { button, control } from "./ui/planner-controls";
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
    store = usePlanningDrafts(),
    [lease] = useState(session.capture),
    [tags, setTags] = useState<TagRecord[]>([]),
    [epoch, setEpoch] = useState(0),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    listId = useId(),
    key = `${target.workspaceId}/tags/${target.record?.id ?? `new-${target.projectId ?? "standalone"}-${target.parentId ?? "root"}`}`;
  const draft = store.supplementalDrafts[key],
    mutate = useSupplementalMutation(() => {
      setEpoch((e) => e + 1);
      context.refresh();
    });
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
          if (alive && session.isCurrent(lease))
            handlers.current.revoke(target.workspaceId);
          return;
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
            "Tags unavailable. Your selections and definition input are kept. Refresh tags to retry.",
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
    ),
    exact = tags.some(
      (t) => t.name.toLowerCase() === query.trim().toLowerCase(),
    );
  function start(tag?: TagRecord) {
    store.setSupplementalDrafts((current) => ({
      ...current,
      [key]: {
        workspaceId: target.workspaceId,
        target,
        label: tag ? `tag ${tag.name}` : "new tag",
        form: "tag",
        path: `/api/workspaces/${target.workspaceId}/tags${tag ? `/${encodeURIComponent(tag.id)}` : ""}`,
        method: tag ? "PATCH" : "POST",
        values: tag
          ? {
              name: tag.name,
              color: tag.color,
              archived: !!tag.archivedAt,
              revision: tag.revision,
            }
          : {
              name: query.trim(),
              color: "teal",
              requestKey: crypto.randomUUID(),
            },
      },
    }));
  }
  function values(patch: Record<string, unknown>) {
    if (draft && !draft.uncertain)
      mutate.change(key, { values: { ...draft.values, ...patch } });
  }
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
      <button
        type="button"
        className={button}
        onClick={() => setEpoch((e) => e + 1)}
      >
        Refresh tags
      </button>
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
              className="max-w-full break-words rounded border px-2 py-1 text-neutral-950"
              style={{ backgroundColor: tagColor(tag?.color ?? "") }}
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
        Find or create tag
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
          maxLength={60}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) =>
                Math.min(i + 1, Math.max(0, suggestions.length - 1)),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (query.trim() && suggestions[active])
                choose(suggestions[active]);
            }
            if (e.key === "Escape") setQuery("");
          }}
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label="Tag suggestions"
        className="max-h-48 overflow-y-auto"
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
                className={
                  button + " w-full break-words text-left text-neutral-950"
                }
                style={{ backgroundColor: tagColor(tag.color) }}
                onClick={() => choose(tag)}
              >
                {tag.name} —{" "}
                {projectPalette.find((c) => c.key === tag.color)?.name}
              </button>
            </li>
          ))}
      </ul>
      {!!query.trim() && !exact && !draft && (
        <button type="button" className={button} onClick={() => start()}>
          Create tag “{query.trim()}”
        </button>
      )}
      <p className="text-sm">
        Choose existing tags or create a definition, then select it and save the
        task. Tags do not change status or scheduling.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer">
          Manage workspace tags
        </summary>
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            <span className="break-words">
              {tag.name}
              {tag.archivedAt ? " (archived)" : ""}
            </span>
            <button
              type="button"
              className={button}
              disabled={!!draft}
              onClick={() => start(tag)}
            >
              Edit tag {tag.name}
            </button>
          </div>
        ))}
      </details>
      {draft && (
        <TagDefinitionForm
          draft={draft}
          update={values}
          save={() => mutate.run(key, draft)}
          discard={() => mutate.discard(key)}
        />
      )}
    </section>
  );
}
function TagDefinitionForm({
  draft,
  update,
  save,
  discard,
}: {
  draft: SupplementalDraft;
  update: (v: Record<string, unknown>) => void;
  save: () => void;
  discard: () => void;
}) {
  const store = usePlanningDrafts(),
    pending = store.savingKeys.includes(
      draft.target?.record
        ? `activity:${draft.workspaceId}/${draft.target.kind}/${draft.target.record!.id}`
        : "configuration:" + draft.workspaceId,
    );
  return (
    <section aria-label="Tag definition" className="space-y-2 border p-2">
      <p>
        {draft.uncertain
          ? "Tag save unconfirmed. Retry the original request; input is kept."
          : "Unsaved tag definition"}
      </p>
      <fieldset disabled={pending || draft.uncertain || !!draft.conflict}>
        <label className="block">
          Tag name
          <input
            className={control}
            maxLength={60}
            value={String(draft.values.name)}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Tag color</legend>
          <div className="flex flex-wrap gap-2">
            {projectPalette.map((c) => (
              <label
                key={c.key}
                className="inline-flex min-h-11 items-center gap-2 rounded border px-2 text-neutral-950"
                style={{ backgroundColor: c.color }}
              >
                <input
                  type="radio"
                  name="tag-color"
                  value={c.key}
                  checked={draft.values.color === c.key}
                  onChange={() => update({ color: c.key })}
                />
                {c.name}
                {draft.values.color === c.key ? " (selected)" : ""}
              </label>
            ))}
          </div>
        </fieldset>
        {draft.method === "PATCH" && (
          <label>
            <input
              type="checkbox"
              checked={!!draft.values.archived}
              onChange={(e) => update({ archived: e.target.checked })}
            />{" "}
            Archived tag
          </label>
        )}
      </fieldset>
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <p role="alert">
          Current tag: {String(draft.conflict.name)}, color{" "}
          {String(draft.conflict.color)}, revision{" "}
          {String(draft.conflict.revision)}. Your input is kept. Discard this
          definition draft and reopen the refreshed definition to review.
        </p>
      )}
      <button
        type="button"
        className={button}
        disabled={
          pending || !!draft.conflict || !String(draft.values.name).trim()
        }
        onClick={save}
      >
        {pending
          ? "Saving tag…"
          : draft.uncertain
            ? "Retry tag save"
            : "Save tag definition"}
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={discard}
      >
        Discard tag definition draft
      </button>
    </section>
  );
}
