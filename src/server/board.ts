import "server-only";
import { verifiedSession } from "./auth";
import { accessibleWorkspaces, Unauthenticated, WorkspaceDenied } from "./workspaces";
import { database } from "./db";

export async function boardPreferences(headers: Headers) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  const workspaces = await accessibleWorkspaces(headers);
  const saved = await database().boardPreference.findUnique({ where: { userId: session.user.id } });
  const accessible = new Set(workspaces.map(item => item.id));
  return { workspaces, workspaceIds: saved ? saved.workspaceIds.filter(id => accessible.has(id)) : workspaces.filter(item => item.kind === "personal").map(item => item.id) };
}
export async function saveBoardPreferences(headers: Headers, workspaceIds: string[]) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  const workspaces = await accessibleWorkspaces(headers);
  const ids = [...new Set(workspaceIds)];
  if (ids.some(id => !workspaces.some(item => item.id === id))) throw new WorkspaceDenied(404, "Workspace not found");
  await database().boardPreference.upsert({ where: { userId: session.user.id }, create: { userId: session.user.id, workspaceIds: ids }, update: { workspaceIds: ids } });
  return { workspaceIds: ids };
}
