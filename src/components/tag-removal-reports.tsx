"use client";
import { useEffect, useRef, useState } from "react";
import type { TagRemovalReceipt } from "@/lib/tag-contracts";
import { usePlannerSession } from "./planner-session";
import { usePlannerContext } from "./planner-context";
import { button } from "./ui/planner-controls";
export function saveUsageFile(blob: Blob) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "kanbrik-tag-usage.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Summary = {
  id: string;
  removedAt: string;
  tagName: string;
  activeCount: number;
  trashCount: number;
};
export function TagRemovalReports({
  workspaceId,
  tagId,
}: {
  workspaceId: string;
  tagId: string;
}) {
  const session = usePlannerSession(),
    [lease] = useState(session.capture);
  const [rows, setRows] = useState<Summary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<TagRemovalReceipt | null>(null),
    [busy, setBusy] = useState(false);
  const alive = useRef(false),
    generation = useRef(0);
  const context = usePlannerContext(),
    handlers = useRef(context);
  useEffect(() => {
    handlers.current = context;
  });
  const base = `/api/workspaces/${workspaceId}/tags/${encodeURIComponent(tagId)}/removals`;
  async function requireReport(response: Response) {
    if (response.ok) return;
    if (response.status === 403 || response.status === 404) {
      const access = await session.fetch(`/api/workspaces/${workspaceId}`);
      if (alive.current && session.isCurrent(lease) && access.status === 404)
        handlers.current.revoke(workspaceId);
    }
    throw Error("Removal report unavailable.");
  }
  useEffect(() => {
    alive.current = true;
    let active = true;
    session
      .fetch(base)
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 403 || r.status === 404) {
            const access = await session.fetch(
              `/api/workspaces/${workspaceId}`,
            );
            if (active && session.isCurrent(lease) && access.status === 404)
              handlers.current.revoke(workspaceId);
          }
          throw Error();
        }
        const data = await r.json();
        if (active && session.isCurrent(lease)) {
          setRows(data.rows);
          setCursor(data.nextCursor);
          setReady(true);
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setError("Removal reports unavailable. Close and reopen to retry.");
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [base, session, lease, workspaceId]);
  async function load(id?: string, download = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    const attempt = ++generation.current;
    try {
      const r = await session.fetch(
        id
          ? `${base}/${encodeURIComponent(id)}${download ? "/export" : ""}`
          : `${base}?cursor=${encodeURIComponent(cursor!)}`,
      );
      await requireReport(r);
      const data = download ? await r.blob() : await r.json();
      if (
        !alive.current ||
        !session.isCurrent(lease) ||
        attempt !== generation.current
      )
        return;
      if (download) saveUsageFile(data);
      else if (id) setReceipt(data);
      else {
        setRows((old) => [...old, ...data.rows]);
        setCursor(data.nextCursor);
      }
    } catch {
      if (alive.current && session.isCurrent(lease))
        setError(
          "Report or download unavailable. Nothing changed. Retry after checking your connection and workspace access.",
        );
    } finally {
      if (alive.current && session.isCurrent(lease)) setBusy(false);
    }
  }
  return (
    <section aria-label="Removal reports" className="space-y-3 p-4">
      <p>
        Reports describe the original removal snapshot, including work now
        changed or restored. Restoring a definition never reattaches former
        assignments automatically. Restore trashed work first, then use normal
        task editors to select only the assignments you want to recover.
      </p>
      {!ready && !error && <p role="status">Loading reports…</p>}
      {error && <p role="alert">{error}</p>}
      {ready && !rows.length && (
        <p>
          No recorded removals for this tag. Earlier archives have no removal
          report.
        </p>
      )}
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="my-2 rounded border p-2">
            <p>
              {r.tagName} · {r.removedAt} · {r.activeCount} active /{" "}
              {r.trashCount} Trash
            </p>
            <button
              className={button}
              disabled={busy}
              type="button"
              onClick={() => void load(r.id)}
            >
              Inspect removal {r.id}
            </button>
            <button
              className={button}
              disabled={busy}
              type="button"
              onClick={() => void load(r.id, true)}
            >
              Download removal {r.id}
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          className={button}
          disabled={busy}
          onClick={() => void load()}
          type="button"
        >
          More removal reports
        </button>
      )}
      {receipt && (
        <section aria-label="Recorded removed usage">
          <h4 className="font-semibold">Original removed usage</h4>
          <p className="break-all">
            {receipt.report.impactDigest} · captured {receipt.report.capturedAt}
          </p>
          <ul>
            {receipt.report.rows.map((r) => (
              <li
                key={r.taskId}
                className="my-2 break-words rounded border p-2"
              >
                {r.title} · {r.type} · {r.project || "No project"}
                {r.parent ? ` / ${r.parent}` : ""} · {r.status} · {r.state}
                <span className="block text-sm">{r.taskId}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
