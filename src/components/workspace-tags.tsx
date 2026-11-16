"use client";
import { useEffect, useRef, useState } from "react";
import type { TagRecord } from "@/lib/tag-contracts";
import { projectPalette, tagColor, themedTint } from "@/lib/project-palette";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { TagDefinitionForm } from "./tag-definition-form";
import { EditorDialog } from "./ui/editor-dialog";
import { button, control } from "./ui/planner-controls";

export function WorkspaceTags({
  workspaceId,
  requestedDraft,
}: {
  workspaceId: string;
  requestedDraft?: string;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const [tags, setTags] = useState<TagRecord[]>([]),
    [query, setQuery] = useState("");
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0),
    [current, setCurrent] = useState<string | null>(requestedDraft ?? null);
  const handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  useEffect(() => {
    let active = true;
    session
      .fetch(`/api/workspaces/${workspaceId}/tags`)
      .then(async (r) => {
        if (r.status === 404) {
          const access = await session.fetch(`/api/workspaces/${workspaceId}`);
          if (active && session.isCurrent(lease) && access.status === 404)
            handlers.current.revoke(workspaceId);
        }
        if (!r.ok) throw Error();
        const rows = await r.json();
        if (active && session.isCurrent(lease)) {
          setTags(rows);
          setReady(true);
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease)) {
          setReady(false);
          setError(
            "Tags unavailable. Retained definition input is kept. Refresh tags to retry.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [session, lease, workspaceId, epoch, store.saveEpoch]);
  const mutate = useSupplementalMutation(() => {
    setReady(false);
    setCurrent(null);
    setEpoch((value) => value + 1);
  });
  const drafts = Object.entries(store.supplementalDrafts).filter(
    ([, d]) => d.form === "tag" && d.workspaceId === workspaceId,
  );
  const candidate = current ? store.supplementalDrafts[current] : undefined;
  const draft =
    candidate?.form === "tag" && candidate.workspaceId === workspaceId
      ? candidate
      : undefined;
  const pending = store.savingKeys.includes("configuration:" + workspaceId);
  function start(tag?: TagRecord) {
    if (!ready || pending) return;
    const key = `${workspaceId}/tags/definitions/${tag?.id ?? "new"}`;
    // Reopening must preserve the original revision/request key, including uncertainty.
    if (!store.supplementalDrafts[key])
      store.setSupplementalDrafts((rows) => ({
        ...rows,
        [key]: {
          workspaceId,
          form: "tag",
          label: tag ? `tag ${tag.name}` : "new tag",
          path: `/api/workspaces/${workspaceId}/tags${tag ? `/${encodeURIComponent(tag.id)}` : ""}`,
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
    setCurrent(key);
  }
  const shown = tags.filter((tag) =>
    tag.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-label="Workspace tags" className="space-y-4">
      <h3 className="text-xl font-semibold">Tags</h3>
      <p>
        Workspace members can manage definitions. Archiving retains existing
        task assignments.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          type="button"
          disabled={!ready || pending}
          onClick={() => start()}
        >
          Create tag
        </button>
        <button
          className={button}
          type="button"
          disabled={pending}
          onClick={() => {
            setReady(false);
            setEpoch((value) => value + 1);
          }}
        >
          Refresh tags
        </button>
      </div>
      <label className="block max-w-xl">
        Search workspace tags
        <input
          className={control}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!ready && !error && <p role="status">Loading tags…</p>}
      <p>
        {shown.length} matching of {tags.length} loaded tags.
      </p>
      <ul
        aria-label="Tag definitions"
        className="max-h-96 space-y-2 overflow-auto"
      >
        {shown.map((tag) => (
          <li
            key={tag.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border p-2"
          >
            <span
              className="min-w-0 break-words rounded px-2 py-1"
              style={{ background: themedTint(tagColor(tag.color)) }}
            >
              {tag.name} ·{" "}
              {projectPalette.find((c) => c.key === tag.color)?.name} ·{" "}
              {tag.archivedAt ? "Archived (assignments retained)" : "Active"}
            </span>
            <button
              className={button}
              type="button"
              disabled={!ready || pending}
              onClick={() => start(tag)}
            >
              Edit tag {tag.name}
            </button>
          </li>
        ))}
      </ul>
      {!!drafts.length && (
        <section
          aria-label="Retained tag definitions"
          className="space-y-2 rounded border bg-amber-50 p-3"
        >
          <h4 className="font-semibold">Retained tag definitions</h4>
          {drafts.map(([key, value]) => (
            <button
              type="button"
              key={key}
              className={button}
              disabled={pending}
              onClick={() => setCurrent(key)}
            >
              Review tag draft: {value.label}
            </button>
          ))}
        </section>
      )}
      {requestedDraft &&
        !draft &&
        !drafts.some(([key]) => key === requestedDraft) && (
          <p>
            The requested definition draft is no longer retained. Saved
            definitions are listed above.
          </p>
        )}
      {current && draft && (
        <EditorDialog
          title="Tag definition"
          dirty
          pending={pending}
          discard={() => mutate.discard(current)}
          close={() => setCurrent(null)}
        >
          <div className="p-4">
            <TagDefinitionForm
              draft={draft}
              update={(values) => {
                if (!draft.uncertain)
                  mutate.change(current, {
                    values: { ...draft.values, ...values },
                  });
              }}
              save={() => {
                void mutate.run(current, draft);
              }}
              discard={() => {
                mutate.discard(current);
                setCurrent(null);
              }}
            />
          </div>
        </EditorDialog>
      )}
    </section>
  );
}
