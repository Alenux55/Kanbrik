import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accessibleWorkspaces, Unauthenticated } from "@/server/workspaces";
import { WorkspaceCreate } from "@/components/workspace-create";

export default async function Workspaces() {
  let workspaces;
  try { workspaces = await accessibleWorkspaces(await headers()); }
  catch (error) { if (error instanceof Unauthenticated) redirect("/sign-in"); throw new Error("Could not load workspaces. Please retry."); }
  return <><h1 className="text-3xl font-semibold">Workspaces</h1><p className="mt-4 leading-7 text-neutral-600">Manage who can access a workspace. This screen does not select an active board or calendar workspace.</p>
    <ul className="mt-8 space-y-3">{workspaces.map(workspace => <li key={workspace.id} className="rounded-xl border border-neutral-200 bg-white p-5"><Link href={`/workspaces/${workspace.id}`} className="inline-flex min-h-12 items-center break-all text-lg font-medium underline">{workspace.name}</Link><p className="mt-1 text-sm capitalize">{workspace.kind} · {workspace.role}</p>{workspace.kind === "personal" && <p className="mt-2 text-sm text-neutral-600">Private to you. Cannot be shared.</p>}</li>)}</ul>
    <WorkspaceCreate />
  </>;
}
