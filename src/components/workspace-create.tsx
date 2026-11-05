"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceCreate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!response.ok) {
        if (response.status === 401) router.replace("/sign-in");
        throw new Error("Could not confirm creation. Your name is kept below; check it and retry.");
      }
      const workspace = await response.json();
      router.push(`/workspaces/${encodeURIComponent(workspace.id)}`); router.refresh();
    } catch { setError("Could not confirm creation. Your name is kept below; check it and retry."); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-6">
    <h2 className="text-xl font-semibold">Create a shared workspace</h2>
    <p className="mt-2 text-sm text-neutral-600">You will be its owner. Your personal workspace stays private.</p>
    <form onSubmit={submit} aria-busy={pending} className="mt-5 space-y-4">
      <label className="block">Workspace name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={pending} className="mt-2 block min-h-12 w-full rounded-lg border border-neutral-400 px-3 focus-visible:outline-2 focus-visible:outline-teal-700" /></label>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <button disabled={pending || !name.trim()} className="min-h-12 rounded-lg bg-teal-900 px-5 py-3 text-white disabled:opacity-60">{pending ? "Saving…" : "Create shared workspace"}</button>
    </form>
  </section>;
}
