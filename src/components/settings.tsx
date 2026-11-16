"use client";
import { useEffect, useRef, useState } from "react";
import { usePlannerContext } from "./planner-context";
import { usePlannerSession } from "./planner-session";
import { validZone } from "@/lib/calendar-time";
import type { WorkspaceSettings as Settings } from "@/lib/settings-contracts";
import { button, control } from "./ui/planner-controls";
import type { Appearance } from "@/lib/settings-contracts";
import Link from "next/link";
import { WorkspaceTags } from "./workspace-tags";
export function SettingsHub({
  workspaceId,
  draftKey,
  children,
}: {
  workspaceId?: string;
  draftKey?: string;
  children?: React.ReactNode;
}) {
  const context = usePlannerContext();
  const [selection, setSelection] = useState({
    workspaceId: workspaceId ?? context.defaultWorkspaceId,
    draftKey,
    review: 0,
  });
  const chosen = selection.workspaceId;
  // Consume local recovery activations even when the URL is unchanged. A new
  // Settings visit uses its explicit route inputs, rather than an old activation.
  const seenReview = useRef(context.tagReview);
  useEffect(() => {
    const review = context.tagReview;
    if (seenReview.current === review) return;
    seenReview.current = review;
    let active = true;
    if (review)
      queueMicrotask(() => {
        if (active)
          setSelection((current) => ({
            workspaceId: review.workspaceId,
            draftKey: review.key,
            review: current.review + 1,
          }));
      });
    return () => {
      active = false;
    };
  }, [context.tagReview]);
  const workspace = context.workspaces.find((item) => item.id === chosen);
  return (
    <section className="space-y-8">
      <h1 className="text-4xl font-semibold">Settings</h1>
      <nav aria-label="Settings sections" className="flex flex-wrap gap-4">
        <a
          className="inline-flex min-h-11 items-center underline"
          href="#account-settings"
        >
          Account
        </a>
        <a
          className="inline-flex min-h-11 items-center underline"
          href="#workspace-tags"
        >
          Workspace
        </a>
      </nav>
      <section
        id="account-settings"
        aria-label="Account settings"
        className="space-y-4"
      >
        <h2 className="text-2xl font-semibold">Account</h2>
        <UserSettings />
        {children}
      </section>
      <section
        id="workspace-tags"
        aria-label="Workspace configuration"
        className="space-y-4 border-t pt-6"
      >
        <h2 className="text-2xl font-semibold">Workspace</h2>
        <label className="block max-w-xl">
          Settings workspace
          <select
            className={control}
            value={chosen}
            onChange={(e) =>
              setSelection((current) => ({
                workspaceId: e.target.value,
                draftKey: undefined,
                review: current.review + 1,
              }))
            }
          >
            {!workspace && (
              <option value={chosen}>Unavailable workspace</option>
            )}
            {context.workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.role})
              </option>
            ))}
          </select>
        </label>
        <p>
          This choice applies to Settings. Your creation workspace and planner
          filters keep their own selections.
        </p>
        {workspace ? (
          <>
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={`/workspaces/${encodeURIComponent(workspace.id)}`}
            >
              {workspace.role === "owner"
                ? "Manage workspace workflow, reference zone and members"
                : "View workspace details; configuration is owner-managed"}
            </Link>
            <WorkspaceTags
              key={`${chosen}:${selection.review}:${selection.draftKey ?? ""}`}
              workspaceId={chosen}
              requestedDraft={selection.draftKey}
            />
          </>
        ) : (
          <p role="alert">
            Workspace unavailable. Choose a current workspace to manage its
            tags.
          </p>
        )}
      </section>
    </section>
  );
}
export function UserSettings() {
  const context = usePlannerContext();
  const [input, setInput] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [appearanceNotice, setAppearanceNotice] = useState("");
  const zone = input ?? context.zone;
  return (
    <section>
      <form
        className="max-w-xl space-y-3"
        aria-label="Appearance"
        onSubmit={(event) => {
          event.preventDefault();
          void context
            .save({ appearance: appearance ?? context.appearance })
            .then((saved) => {
              if (saved) {
                setAppearance(null);
                setAppearanceNotice("Appearance saved for your account.");
              }
            });
        }}
      >
        <label className="block">
          Appearance
          <select
            className={control}
            disabled={context.pending}
            value={appearance ?? context.appearance}
            onChange={(e) => {
              setAppearance(e.target.value as Appearance);
              setAppearanceNotice("");
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <p>
          System follows your device. Light and Dark override it across devices
          after saving.
        </p>
        {appearance !== null && <p role="status">Unsaved appearance choice</p>}
        <button className={button} disabled={context.pending}>
          Save appearance
        </button>
        {appearanceNotice && <p role="status">{appearanceNotice}</p>}
      </form>
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
        their own Account time zone in Settings. Legacy workspaces start at UTC.
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
