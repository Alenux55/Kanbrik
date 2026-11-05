import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readableWorkspace, Unauthenticated } from "@/server/workspaces";
import { WorkspaceMembers } from "@/components/workspace-members";

export default async function Workspace({ params }: { params: Promise<{ id: string }> }) {
  let workspace;
  try { workspace = await readableWorkspace(await headers(), (await params).id); }
  catch (error) { if (error instanceof Unauthenticated) redirect("/sign-in"); throw new Error("Could not load workspace. Please retry."); }
  if (!workspace) return <><h1 className="text-3xl font-semibold">Workspace unavailable</h1><p className="my-5">This workspace does not exist or is no longer accessible to your account.</p><Link href="/workspaces" className="underline">Back to your workspaces</Link></>;
  return <WorkspaceMembers key={workspace.id} initial={workspace} />;
}
