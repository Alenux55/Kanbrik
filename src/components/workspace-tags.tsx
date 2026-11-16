"use client";
import { useEffect, useRef, useState } from "react";
import type { TagRecord } from "@/lib/tag-contracts";
import { projectPalette, tagColor, themedTint } from "@/lib/project-palette";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { usePlanningDrafts } from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { TagDefinitionForm } from "./tag-definition-form";
import { TagRemovalForm } from "./tag-removal-form";
import { TagRemovalReports, saveUsageFile } from "./tag-removal-reports";
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
  const [reportTag, setReportTag] = useState<TagRecord | null>(null);
  const alive = useRef(true);
  const dialogSource = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
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
    ([, d]) =>
      (d.form === "tag" || d.form === "tag-remove") &&
      d.workspaceId === workspaceId,
  );
  const candidate = current ? store.supplementalDrafts[current] : undefined;
  const draft =
    (candidate?.form === "tag" || candidate?.form === "tag-remove") &&
    candidate.workspaceId === workspaceId
      ? candidate
      : undefined;
  const pending = store.savingKeys.includes("configuration:" + workspaceId);
  async function checkAccess(response: Response) {
    if (response.status !== 403 && response.status !== 404) return;
    const access = await session.fetch(`/api/workspaces/${workspaceId}`);
    if (alive.current && session.isCurrent(lease) && access.status === 404)
      handlers.current.revoke(workspaceId);
  }
  function start(tag?: TagRecord) {
    if (!ready || pending) return;
    dialogSource.current = document.activeElement as HTMLElement;
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
  async function reviewRemoval(tag: TagRecord, refresh = false) {
    // Preparing a preview disables its trigger and can blur it before the
    // modal mounts. Keep the original focus destination across that request.
    if (!refresh) dialogSource.current = document.activeElement as HTMLElement;
    const key = `${workspaceId}/tags/removal/${tag.id}`;
    if (!refresh && store.supplementalDrafts[key]) {
      setCurrent(key);
      return;
    }
    const lock = "configuration:" + workspaceId;
    if (!store.beginSave(lock)) return;
    try {
      let revision = tag.revision;
      if (refresh) {
        const response = await session.fetch(
          `/api/workspaces/${workspaceId}/tags`,
        );
        if (!response.ok)
          throw Error("Tags unavailable. Original review is kept.");
        const latest: TagRecord[] = await response.json();
        const found = latest.find((row) => row.id === tag.id);
        if (!found) throw Error("Tag unavailable. Original review is kept.");
        revision = found.revision;
      }
      const response = await session.fetch(
        `/api/workspaces/${workspaceId}/tags/${encodeURIComponent(tag.id)}/removal-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        await checkAccess(response);
        throw Error(
          result.error ??
            "Removal preview unavailable. Refresh tags and review again.",
        );
      }
      if (!alive.current || !session.isCurrent(lease)) return;
      store.setSupplementalDrafts((rows) => ({
        ...rows,
        [key]: {
          workspaceId,
          form: "tag-remove",
          label: `removal of tag ${result.tagName}`,
          path: `/api/workspaces/${workspaceId}/tags/${encodeURIComponent(tag.id)}/remove`,
          method: "POST",
          values: { review: result.review, requestKey: crypto.randomUUID() },
          tagRemoval: result,
        },
      }));
      setError("");
      setCurrent(key);
    } catch (cause) {
      if (alive.current && session.isCurrent(lease))
        setError(
          cause instanceof Error
            ? cause.message
            : "Removal review unavailable. Input is kept.",
        );
    } finally {
      store.finishSave(lock, false);
    }
  }
  async function downloadReview() {
    if (!draft?.tagRemoval || !current) return;
    const lock = "configuration:" + workspaceId;
    if (!store.beginSave(lock)) return;
    try {
      const response = await session.fetch(
        `/api/workspaces/${workspaceId}/tags/${encodeURIComponent(draft.tagRemoval.tagId)}/removal-preview/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review: draft.values.review }),
        },
      );
      if (!response.ok) {
        await checkAccess(response);
        const result = await response.json();
        if (session.isCurrent(lease))
          mutate.change(current, {
            error: result.error ?? "Download failed. Original review is kept.",
            conflict:
              response.status === 409 ? { reviewRequired: true } : undefined,
          });
        return;
      }
      const blob = await response.blob();
      if (alive.current && session.isCurrent(lease)) saveUsageFile(blob);
    } catch {
      if (session.isCurrent(lease))
        mutate.change(current, {
          error:
            "Usage download failed. Nothing changed. Retry the download or review the latest impact.",
        });
    } finally {
      store.finishSave(lock, false);
    }
  }
  const shown = tags.filter((tag) =>
    tag.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-label="Workspace tags" className="space-y-4">
      <h3 className="text-xl font-semibold">Tags</h3>
      <p>
        Workspace members can manage definitions. Remove reviews all
        assignments, detaches the selected tag and archives its definition.
        Reports support deliberate recovery; restoring a definition does not
        retag former work.
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
              {tag.archivedAt ? "Archived" : "Active"}
            </span>
            <button
              className={button}
              type="button"
              disabled={!ready || pending}
              onClick={() => start(tag)}
            >
              Edit tag {tag.name}
            </button>
            <button
              className={button}
              type="button"
              disabled={!ready || pending}
              onClick={() => void reviewRemoval(tag)}
            >
              {tag.archivedAt ? "Review remaining usage" : "Remove tag"}{" "}
              {tag.name}
            </button>
            <button
              className={button}
              type="button"
              disabled={pending}
              onClick={() => setReportTag(tag)}
            >
              Removal reports {tag.name}
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
              onClick={() => {
                dialogSource.current = document.activeElement as HTMLElement;
                setCurrent(key);
              }}
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
          title={draft.form === "tag-remove" ? "Remove tag" : "Tag definition"}
          dirty
          pending={pending}
          discard={() => mutate.discard(current)}
          close={() => setCurrent(null)}
          focusAfterClose={() =>
            !dialogSource.current
              ? null
              : dialogSource.current.isConnected &&
                  !dialogSource.current.matches(":disabled")
                ? dialogSource.current
                : document.getElementById("main-content")
          }
        >
          <div className="p-4">
            {draft.form === "tag-remove" ? (
              <TagRemovalForm
                draft={draft}
                pending={pending}
                save={() => void mutate.run(current, draft)}
                download={() => void downloadReview()}
                refresh={() => {
                  if (draft.tagRemoval)
                    void reviewRemoval(
                      {
                        id: draft.tagRemoval.tagId,
                        workspaceId,
                        name: draft.tagRemoval.tagName,
                        color: "teal",
                        revision: draft.tagRemoval.tagRevision,
                        archivedAt: null,
                      },
                      true,
                    );
                }}
                discard={() => {
                  mutate.discard(current);
                  setCurrent(null);
                }}
              />
            ) : (
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
            )}
          </div>
        </EditorDialog>
      )}
      {reportTag && (
        <EditorDialog
          title={`Removal reports: ${reportTag.name}`}
          dirty={false}
          discard={() => setReportTag(null)}
          close={() => setReportTag(null)}
        >
          <TagRemovalReports workspaceId={workspaceId} tagId={reportTag.id} />
        </EditorDialog>
      )}
    </section>
  );
}
