"use client";
import { useState } from "react";
import { projectPalette, tagColor, themedTint } from "@/lib/project-palette";
import { usePlanningDrafts, type SupplementalDraft } from "./planning-drafts";
import { button, control } from "./ui/planner-controls";
export function TagDefinitionForm({
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
    pending = store.savingKeys.includes("configuration:" + draft.workspaceId);
  const [wasArchived] = useState(!!draft.values.archived);
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
                style={{ backgroundColor: themedTint(tagColor(c.key)) }}
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
              disabled={!wasArchived}
              onChange={(e) => update({ archived: e.target.checked })}
            />{" "}
            Archived tag
          </label>
        )}
      </fieldset>
      <p className="text-sm">
        Remove a tag from the workspace list to review and detach its
        assignments. Restoring a definition makes it selectable again; it does
        not automatically restore former assignments. Use removal reports to
        recover assignments deliberately.
      </p>
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <p role="alert">
          Current tag: {String(draft.conflict.name)}, color{" "}
          {String(draft.conflict.color)}, revision{" "}
          {String(draft.conflict.revision)}. Your input is kept. Discard this
          definition draft, refresh tags and reopen the definition to review.
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
