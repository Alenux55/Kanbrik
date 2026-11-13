import "server-only";
import { database } from "./db";
import { verifiedSession } from "./auth";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkspaceDetail, WorkspaceSummary } from "@/lib/workspace-contracts";

export class Unauthenticated extends Error {}
export class WorkspaceDenied extends Error {
  constructor(public status: 403 | 404, message: string) { super(message); }
}

async function actor(headers: Headers) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  return session.user.id;
}

function accessible(userId: string): Prisma.WorkspaceWhereInput {
  return { OR: [
    { kind: "personal", personalOwnerId: userId, memberships: { some: { userId, role: "owner" } } },
    { kind: "shared", memberships: { some: { userId } } },
  ] };
}

export async function personalWorkspace(headers: Headers) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  const userId = session.user.id;
  // Lock only this user's onboarding. Unique constraints remain authoritative.
  return database().$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))::text`;
    const workspace = await tx.workspace.upsert({
      where: { personalOwnerId: userId },
      update: {},
      create: { name: "Personal workspace", kind: "personal", personalOwnerId: userId },
    });
    await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: { role: "owner" },
      create: { workspaceId: workspace.id, userId, role: "owner" },
    });
    return workspace;
  });
}

export async function accessibleWorkspaces(headers: Headers): Promise<WorkspaceSummary[]> {
  await personalWorkspace(headers);
  const userId = await actor(headers);
  const workspaces = await database().workspace.findMany({
    where: accessible(userId), orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, kind: true, timeZone: true, memberships: { where: { userId }, select: { role: true } } },
  });
  return workspaces.map(workspace => ({ id: workspace.id, name: workspace.name, kind: workspace.kind, timeZone: workspace.timeZone, role: workspace.memberships[0].role }));
}

export async function readableWorkspace(headers: Headers, id: string): Promise<WorkspaceDetail | null> {
  const userId = await actor(headers);
  const workspace = await database().workspace.findFirst({
    where: { id, ...accessible(userId) },
    select: { id: true, name: true, kind: true, timeZone: true, memberships: {
      orderBy: [{ role: "asc" }, { id: "asc" }],
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
    } },
  });
  if (!workspace) return null;
  return {
    id: workspace.id, name: workspace.name, kind: workspace.kind, timeZone: workspace.timeZone,
    role: workspace.memberships.find(member => member.user.id === userId)!.role,
    members: workspace.memberships.map(member => ({ id: member.id, role: member.role, name: member.user.name, email: member.user.email, isYou: member.user.id === userId })),
  };
}

export async function createSharedWorkspace(headers: Headers, name: string, timeZone?: string): Promise<WorkspaceSummary> {
  const userId = await actor(headers);
  timeZone ??= (await database().plannerPreference.findUnique({ where: { userId } }))?.timeZone ?? "UTC";
  // Nested writes commit or roll back together, including the owner's membership.
  const workspace = await database().workspace.create({
    data: { name, kind: "shared", timeZone, memberships: { create: { userId, role: "owner" } } },
    select: { id: true, name: true, kind: true, timeZone: true },
  });
  return { ...workspace, role: "owner" };
}

// Membership mutations share a workspace row lock and recheck current authority
// after acquiring it. A revoked member waiting for that lock cannot write later.
async function sharedMutation<T>(headers: Headers, workspaceId: string, ownerOnly: boolean,
  operation: (tx: Prisma.TransactionClient, userId: string) => Promise<T>): Promise<T> {
  const userId = await actor(headers);
  return database().$transaction(async tx => {
    const initial = await tx.workspace.findFirst({ where: { id: workspaceId, ...accessible(userId) }, select: { id: true, kind: true } });
    if (!initial) throw new WorkspaceDenied(404, "Workspace not found");
    if (initial.kind !== "shared") throw new WorkspaceDenied(403, "Personal workspace membership cannot be changed");
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
    const membership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
    if (!membership) throw new WorkspaceDenied(404, "Workspace not found");
    if (ownerOnly && membership.role !== "owner") throw new WorkspaceDenied(403, "Owner access required");
    return operation(tx, userId);
  });
}

// Content uses the very same workspace row lock as membership changes. Recheck
// both membership and personal-owner identity after waiting for that lock.
export async function workspaceContent<T>(headers: Headers, workspaceId: string,
  operation: (tx: Prisma.TransactionClient, userId: string) => Promise<T>): Promise<T> {
  const userId = await actor(headers);
  return database().$transaction(async tx => {
    const scope = { id: workspaceId, ...accessible(userId) };
    if (!await tx.workspace.findFirst({ where: scope, select: { id: true } })) throw new WorkspaceDenied(404, "Workspace not found");
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
    if (!await tx.workspace.findFirst({ where: scope, select: { id: true } })) throw new WorkspaceDenied(404, "Workspace not found");
    return operation(tx, userId);
  });
}

export async function addEditor(headers: Headers, workspaceId: string, email: string) {
  return sharedMutation(headers, workspaceId, true, async tx => {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new WorkspaceDenied(404, "No existing account has that email");
    const existing = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { role: true } });
    if (existing?.role === "owner") throw new WorkspaceDenied(403, "Owner membership cannot be changed");
    await tx.membership.upsert({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, update: {}, create: { workspaceId, userId: user.id, role: "editor" } });
    return { saved: true };
  });
}

export async function removeEditor(headers: Headers, workspaceId: string, membershipId: string) {
  return sharedMutation(headers, workspaceId, true, async tx => {
    const membership = await tx.membership.findFirst({ where: { id: membershipId, workspaceId }, select: { id: true, role: true } });
    if (!membership) throw new WorkspaceDenied(404, "Member not found");
    if (membership.role === "owner") throw new WorkspaceDenied(403, "Owner membership cannot be changed");
    await tx.membership.delete({ where: { id: membership.id } });
    return { saved: true };
  });
}

export async function leaveWorkspace(headers: Headers, workspaceId: string) {
  return sharedMutation(headers, workspaceId, false, async (tx, userId) => {
    const membership = await tx.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (membership.role === "owner") throw new WorkspaceDenied(403, "Owner membership cannot be changed");
    await tx.membership.delete({ where: { id: membership.id } });
    return { saved: true };
  });
}
