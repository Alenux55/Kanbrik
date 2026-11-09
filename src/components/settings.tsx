"use client";
import { useEffect, useState } from "react";
import { usePlannerContext } from "./planner-context";
import { usePlannerSession } from "./planner-session";
import { validZone } from "@/lib/calendar-time";
import type { WorkspaceSettings as Settings } from "@/lib/settings-contracts";
import { button, control } from "./ui/planner-controls";
export function UserSettings() {
  const context = usePlannerContext();
  const [input, setInput] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const zone = input ?? context.zone;
  return (
    <section>
      <h1 className="text-4xl font-semibold">User settings</h1>
      <form
        className="mt-6 max-w-xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void context.save({ timeZone: zone }).then((saved) => {
            if (saved) {
              setInput(null);
              setNotice("Time zone saved. Existing schedules have not moved.");
            }
          });
        }}
      >
        <label className="block">
          Preferred time zone
          <input
            className={control}
            value={zone}
            disabled={context.pending}
            onChange={(event) => {
              setInput(event.target.value);
              setNotice("");
            }}
          />
        </label>
        <p>
          Use an IANA name, such as Europe/London or America/Los_Angeles. Your
          Calendar and time entry use this zone across devices. Unfinished
          drafts keep their captured input zone.
        </p>
        <p>
          {context.timeZone
            ? "Saved preference"
            : "Browser detection with UTC fallback; save to use across devices"}
        </p>
        <button
          className={button}
          disabled={context.pending || !validZone(zone)}
        >
          Save time zone
        </button>
        {context.error && <p role="alert">{context.error}</p>}
        {notice && <p role="status">{notice}</p>}
      </form>
    </section>
  );
}
export function WorkspaceSettings({
  workspaceId,
  owner,
}: {
  workspaceId: string;
  owner: boolean;
}) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const context = usePlannerContext();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    session
      .fetch(`/api/workspaces/${workspaceId}/settings`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (active && session.isCurrent(lease)) {
          setSaved(data);
          setError("");
        }
      })
      .catch(() => {
        if (active && session.isCurrent(lease))
          setError("Workspace settings unavailable. Retry.");
      });
    return () => {
      active = false;
    };
  }, [session, lease, workspaceId, epoch]);
  async function save() {
    if (!saved || pending || conflict) return;
    setPending(true);
    setError("");
    try {
      const r = await session.fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeZone: zone ?? saved.timeZone,
          revision: saved.settingsRevision,
        }),
      });
      const result = await r.json();
      if (!session.isCurrent(lease)) return;
      if (r.status === 409) {
        setConflict(result.current);
        setError("Settings changed. Review before another explicit save.");
        return;
      }
      if (!r.ok) throw new Error();
      setSaved(result);
      setZone(null);
      setNotice(
        "Workspace reference zone saved. Scheduled instants are unchanged.",
      );
      context.refresh();
    } catch {
      if (session.isCurrent(lease))
        setError("Settings not confirmed saved. Input kept.");
    } finally {
      if (session.isCurrent(lease)) setPending(false);
    }
  }
  return (
    <section
      aria-label="Workspace settings"
      className="mt-8 space-y-4 rounded border p-4"
    >
      <h2 className="text-xl font-semibold">Workspace settings</h2>
      <p>
        Shared reference time zone. Each member views and enters schedules in
        their own User settings zone. Legacy workspaces start at UTC.
      </p>
      {saved && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            Workspace time zone
            <input
              className={control}
              disabled={!owner || pending}
              value={zone ?? saved.timeZone}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
          {owner ? (
            <button
              className={button}
              disabled={
                pending || !!conflict || !validZone(zone ?? saved.timeZone)
              }
            >
              Save workspace settings
            </button>
          ) : (
            <p>Only the owner can change this setting.</p>
          )}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {!saved && (
        <button className={button} onClick={() => setEpoch((e) => e + 1)}>
          Retry workspace settings
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {conflict && (
        <div>
          <p>
            Saved zone: {conflict.timeZone}, revision{" "}
            {conflict.settingsRevision}
          </p>
          <button
            className={button}
            onClick={() => {
              setSaved(conflict);
              setConflict(null);
              setError("");
            }}
          >
            Reviewed: keep proposed zone
          </button>
        </div>
      )}
    </section>
  );
}
