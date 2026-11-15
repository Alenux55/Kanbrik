"use client";
import { useEffect, useRef, useState } from "react";
import type { EntityTarget } from "./entity-editor";
import type {
  VendorRecord,
  WorkListRecord,
  WorkListsPage,
  ListItemRecord,
} from "@/lib/work-list-contracts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import {
  activityLock,
  usePlanningDrafts,
  type SupplementalDraft,
} from "./planning-drafts";
import { useSupplementalMutation } from "./use-supplemental-mutation";
import { button, control } from "./ui/planner-controls";
export function WorkListsPanel({
  target,
  readOnly = false,
  blocked = false,
}: {
  target: EntityTarget;
  readOnly?: boolean;
  blocked?: boolean;
}) {
  const session = usePlannerSession(),
    context = usePlannerContext(),
    store = usePlanningDrafts();
  const [lease] = useState(session.capture);
  const [data, setData] = useState<WorkListsPage | null>(null),
    [vendors, setVendors] = useState<VendorRecord[]>([]),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [loading, setLoading] = useState(true),
    [archived, setArchived] = useState(false);
  const handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  const base = `/api/workspaces/${target.workspaceId}/${target.kind}/${target.record!.id}/lists`,
    scope = `${target.workspaceId}/${target.kind}/${target.record!.id}/lists/`,
    pending = store.savingKeys.includes(activityLock(target));
  const mutations = useSupplementalMutation(() => setEpoch((x) => x + 1));
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      await Promise.all([
        session.fetch(base),
        session.fetch(`/api/workspaces/${target.workspaceId}/vendors`),
      ])
        .then(async (responses) => {
          if (!active || !session.isCurrent(lease)) return;
          if (responses.some((r) => r.status === 404)) {
            const access = await session.fetch(
              `/api/workspaces/${target.workspaceId}`,
            );
            if (!active || !session.isCurrent(lease)) return;
            if (access.status === 404) {
              handlers.current.revoke(target.workspaceId);
              return;
            }
          }
          if (responses.some((r) => !r.ok)) throw Error();
          const [lists, choices] = await Promise.all(
            responses.map((r) => r.json()),
          );
          if (active && session.isCurrent(lease)) {
            setData(lists);
            setVendors(choices);
          }
        })
        .catch(() => {
          if (active && session.isCurrent(lease)) {
            setData(null);
            setVendors([]);
            setError(
              "Lists or vendors unavailable. Input is kept; refresh lists before saving.",
            );
          }
        })
        .finally(() => {
          if (active && session.isCurrent(lease)) setLoading(false);
        });
    }
    void load();
    return () => {
      active = false;
    };
  }, [session, lease, base, target.workspaceId, epoch]);
  const paused = readOnly || !!data?.readOnly,
    disabled = blocked || pending || loading || !data || !!error;
  function draft(
    key: string,
    form: SupplementalDraft["form"],
    label: string,
    path: string,
    method: "POST" | "PATCH",
    values: Record<string, unknown>,
  ) {
    const value: SupplementalDraft = {
      workspaceId: target.workspaceId,
      target,
      form,
      label,
      path,
      method,
      values,
    };
    store.setSupplementalDrafts((current) =>
      current[key] ? current : { ...current, [key]: value },
    );
    return value;
  }
  function section(
    list?: WorkListRecord,
    kind: WorkListRecord["kind"] = "checklist",
  ) {
    draft(
      scope + (list?.id ?? "new-" + kind),
      "list",
      list?.name ?? (kind === "checklist" ? "Checklist" : "Shopping list"),
      base + (list ? "/" + list.id : ""),
      list ? "PATCH" : "POST",
      list
        ? {
            name: list.name,
            archived: !!list.archivedAt,
            revision: list.revision,
          }
        : { name: "", kind, requestKey: crypto.randomUUID() },
    );
  }
  function item(list: WorkListRecord, row?: ListItemRecord) {
    draft(
      scope + list.id + "/" + (row?.id ?? "new"),
      list.kind === "checklist" ? "item-checklist" : "item-shopping",
      list.name + " item",
      base + "/" + list.id + "/items" + (row ? "/" + row.id : ""),
      row ? "PATCH" : "POST",
      {
        text: row?.text ?? "",
        ...(list.kind === "checklist"
          ? { checked: row?.checked ?? false }
          : {
              quantity: row?.quantity ?? 1,
              vendorId: row?.vendorId ?? null,
              purchased: row?.purchased ?? false,
            }),
        ...(row
          ? { archived: !!row.archivedAt, revision: row.revision }
          : { requestKey: crypto.randomUUID() }),
      },
    );
  }
  function vendor(row?: VendorRecord) {
    draft(
      scope + "vendor/" + (row?.id ?? "new"),
      "vendor",
      row?.name ?? "Vendor",
      `/api/workspaces/${target.workspaceId}/vendors` +
        (row ? "/" + row.id : ""),
      row ? "PATCH" : "POST",
      row
        ? { name: row.name, archived: !!row.archivedAt, revision: row.revision }
        : { name: "", requestKey: crypto.randomUUID() },
    );
  }
  const drafts = Object.entries(store.supplementalDrafts).filter(([key]) =>
    key.startsWith(scope),
  );
  return (
    <section
      aria-label="Checklists and shopping lists"
      className="mt-6 min-w-0 space-y-4 border-t pt-4 [overflow-wrap:anywhere]"
    >
      <h3 className="text-lg font-semibold">Checklists and shopping lists</h3>
      <p>
        Independent sections for this work. Checkboxes never change task status
        or scheduling. Sections and items are archived reversibly.
      </p>
      <button
        type="button"
        className={button}
        disabled={pending || blocked || loading}
        onClick={() => setEpoch((x) => x + 1)}
      >
        Refresh lists and vendors
      </button>
      {loading && <p role="status">Loading lists...</p>}
      {error && <p role="alert">{error}</p>}
      {paused && (
        <p>
          Lists are read-only in Trash. Restore the work, then refresh lists.
          Retained input is paused.
        </p>
      )}
      <label className="block">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />{" "}
        Show archived sections and items
      </label>
      {data && !data.lists.length && <p>No saved lists.</p>}
      {data?.lists
        .filter((list) => archived || !list.archivedAt)
        .map((list) => (
          <section
            key={list.id}
            aria-label={`${list.kind === "checklist" ? "Checklist" : "Shopping list"}: ${list.name}`}
            className="min-w-0 space-y-3 rounded border p-3"
          >
            <h4 className="font-semibold">
              {list.name} ·{" "}
              {list.kind === "checklist" ? "Checklist" : "Shopping list"}
              {list.archivedAt && " (archived)"}
            </h4>
            <p>
              {
                list.items.filter(
                  (row) =>
                    !row.archivedAt &&
                    (list.kind === "checklist" ? row.checked : row.purchased),
                ).length
              }{" "}
              of {list.items.filter((row) => !row.archivedAt).length}{" "}
              {list.kind === "checklist" ? "checked" : "purchased"}
            </p>
            {!paused && (
              <button
                type="button"
                className={button}
                disabled={disabled}
                onClick={() => section(list)}
              >
                Edit section / archive / restore
              </button>
            )}
            {list.items
              .filter((row) => archived || !row.archivedAt)
              .map((row) => (
                <article key={row.id} className="space-y-2 border-t py-3">
                  <p className="whitespace-pre-wrap">
                    {row.text}
                    {row.archivedAt && " (archived)"}
                  </p>
                  {list.kind === "checklist" ? (
                    <p>{row.checked ? "Checked" : "Unchecked"}</p>
                  ) : (
                    <p>
                      Quantity: {row.quantity} · Vendor:{" "}
                      {vendors.find((v) => v.id === row.vendorId)?.name ??
                        "Unassigned"}
                      {vendors.find((v) => v.id === row.vendorId)?.archivedAt &&
                        " (archived)"}{" "}
                      · {row.purchased ? "Purchased" : "Not purchased"}
                    </p>
                  )}
                  {!paused && !list.archivedAt && (
                    <button
                      type="button"
                      className={button}
                      disabled={disabled}
                      onClick={() => item(list, row)}
                    >
                      Edit item / archive / restore
                    </button>
                  )}
                </article>
              ))}
            {!paused && !list.archivedAt && (
              <button
                type="button"
                className={button}
                disabled={disabled}
                onClick={() => item(list)}
              >
                Add item to {list.name}
              </button>
            )}
          </section>
        ))}
      {!paused && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => section(undefined, "checklist")}
          >
            Add checklist
          </button>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => section(undefined, "shopping")}
          >
            Add shopping list
          </button>
        </div>
      )}
      {data?.lists.some((list) => list.kind === "shopping") && (
        <details className="min-w-0 rounded border p-3">
          <summary className="min-h-11 cursor-pointer">
            Workspace vendor choices
          </summary>
          <p>
            Changes affect the dropdowns in this workspace. Archived names
            remain readable on existing items.
          </p>
          {vendors.map((row) => (
            <p key={row.id}>
              {row.name}
              {row.archivedAt && " (archived)"}{" "}
              {!paused && (
                <button
                  type="button"
                  className={button}
                  disabled={disabled}
                  onClick={() => vendor(row)}
                >
                  Edit vendor: {row.name}
                </button>
              )}
            </p>
          ))}
          {!paused && (
            <button
              type="button"
              className={button}
              disabled={disabled}
              onClick={() => vendor()}
            >
              Add vendor
            </button>
          )}
        </details>
      )}
      {!readOnly &&
        drafts.map(([key, d]) => (
          <SupplementalForm
            key={key}
            draft={d}
            vendors={vendors}
            disabled={disabled || paused}
            pending={pending || blocked}
            change={(values) =>
              mutations.change(key, { values: { ...d.values, ...values } })
            }
            discard={() => mutations.discard(key)}
            review={() =>
              mutations.change(key, {
                values: { ...d.values, revision: d.conflict!.revision },
                conflict: undefined,
                error: undefined,
                uncertain: false,
              })
            }
            onSave={() => void mutations.run(key, d)}
          />
        ))}
    </section>
  );
}
function SupplementalForm({
  draft,
  disabled,
  pending,
  vendors,
  change,
  discard,
  review,
  onSave,
}: {
  draft: SupplementalDraft;
  disabled: boolean;
  pending: boolean;
  vendors: VendorRecord[];
  change: (values: Record<string, unknown>) => void;
  discard: () => void;
  review: () => void;
  onSave: () => void;
}) {
  const values = draft.values,
    isItem = draft.form?.startsWith("item-"),
    shopping = draft.form === "item-shopping";
  return (
    <form
      aria-label={"Unsaved " + draft.label}
      className="min-w-0 space-y-3 rounded border bg-amber-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h4 className="font-semibold">Unsaved {draft.label}</h4>
      {draft.uncertain && (
        <p role="status">Save unconfirmed. Input is frozen for a safe retry.</p>
      )}
      <fieldset
        disabled={disabled || draft.uncertain}
        className="min-w-0 space-y-3"
      >
        <label className="block">
          {isItem
            ? "Item text"
            : draft.form === "vendor"
              ? "Vendor name"
              : "Section name"}
          <input
            className={control}
            required
            maxLength={isItem ? 1000 : 100}
            value={String(values[isItem ? "text" : "name"] ?? "")}
            onChange={(e) =>
              change({ [isItem ? "text" : "name"]: e.target.value })
            }
          />
        </label>
        {draft.form === "item-checklist" && (
          <label className="block">
            <input
              type="checkbox"
              checked={!!values.checked}
              onChange={(e) => change({ checked: e.target.checked })}
            />{" "}
            Checked
          </label>
        )}
        {shopping && (
          <>
            <label className="block">
              Quantity
              <input
                className={control}
                type="number"
                required
                min="0.001"
                max="1000000"
                step="0.001"
                value={String(values.quantity ?? 1)}
                onChange={(e) =>
                  change({
                    quantity:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="block">
              Vendor
              <select
                className={control}
                value={String(values.vendorId ?? "")}
                onChange={(e) => change({ vendorId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {vendors
                  .filter((v) => !v.archivedAt || v.id === values.vendorId)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.archivedAt ? " (archived; retained)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <input
                type="checkbox"
                checked={!!values.purchased}
                onChange={(e) => change({ purchased: e.target.checked })}
              />{" "}
              Purchased
            </label>
          </>
        )}
        {draft.method === "PATCH" && (
          <label className="block">
            <input
              type="checkbox"
              checked={!!values.archived}
              onChange={(e) => change({ archived: e.target.checked })}
            />{" "}
            Archived (uncheck to restore)
          </label>
        )}
      </fieldset>
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.conflict && (
        <section aria-label="Saved supplemental version">
          <h5>Saved version — review before retrying</h5>
          <dl>
            {Object.entries(draft.conflict)
              .filter(([field]) =>
                [
                  "name",
                  "text",
                  "checked",
                  "quantity",
                  "vendorId",
                  "purchased",
                  "revision",
                  "archivedAt",
                ].includes(field),
              )
              .map(([field, value]) => (
                <div key={field}>
                  <dt className="font-semibold">
                    {field === "vendorId"
                      ? "Vendor"
                      : field === "archivedAt"
                        ? "Archived"
                        : field}
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {field === "vendorId"
                      ? (vendors.find((v) => v.id === value)?.name ??
                        "Unassigned")
                      : field === "archivedAt"
                        ? value
                          ? "Yes"
                          : "No"
                        : String(value ?? "Unassigned")}
                  </dd>
                </div>
              ))}
          </dl>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={review}
          >
            Review complete: keep list input
          </button>
        </section>
      )}
      <button
        type="submit"
        className={button}
        disabled={disabled || !!draft.conflict}
      >
        {draft.uncertain
          ? "Retry same list save"
          : "Save " +
            (isItem ? "item" : draft.form === "vendor" ? "vendor" : "section")}
      </button>
      <button
        type="button"
        className={button}
        disabled={pending}
        onClick={discard}
      >
        Discard this list input
      </button>
      {draft.uncertain && (
        <p>
          Discarding input cannot undo a request already committed. Refresh
          saved data before starting a new request.
        </p>
      )}
    </form>
  );
}
