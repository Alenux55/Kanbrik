import "server-only";
import { database } from "./db";
import { verifiedSession } from "./auth";

export class Unauthenticated extends Error {}

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

export async function readableWorkspace(headers: Headers, id: string) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  return database().workspace.findFirst({
    where: { id, kind: "personal", personalOwnerId: session.user.id, memberships: { some: { userId: session.user.id, role: "owner" } } },
    select: { id: true, name: true, kind: true },
  });
}
