import "server-only";
import type { z } from "zod";
import type {
  plannerPreferenceInput,
  workspaceSettingsInput,
} from "@/lib/settings-contracts";
import { verifiedSession } from "./auth";
import { database } from "./db";
import {
  accessibleWorkspaces,
  workspaceContent,
  Unauthenticated,
  WorkspaceDenied,
} from "./workspaces";
import { PlanningConflict } from "./planning";
export async function plannerPreferences(headers: Headers) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  const workspaces = await accessibleWorkspaces(headers);
  const saved = await database().plannerPreference.findUnique({
    where: { userId: session.user.id },
  });
  return {
    workspaces,
    defaultWorkspaceId:
      workspaces.find((item) => item.id === saved?.defaultWorkspaceId)?.id ??
      workspaces.find((item) => item.kind === "personal")!.id,
    timeZone: saved?.timeZone ?? null,
  };
}
export async function savePlannerPreferences(
  headers: Headers,
  input: z.infer<typeof plannerPreferenceInput>,
) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  const save = () =>
    database().plannerPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...input },
      update: input,
    });
  // Use the same lock/recheck as membership mutations for a new destination.
  if (input.defaultWorkspaceId)
    await workspaceContent(headers, input.defaultWorkspaceId, (tx) =>
      tx.plannerPreference.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, ...input },
        update: input,
      }),
    );
  else await save();
  return plannerPreferences(headers);
}
export function workspaceSettings(headers: Headers, id: string) {
  return workspaceContent(headers, id, (tx) =>
    tx.workspace.findUniqueOrThrow({
      where: { id },
      select: { timeZone: true, settingsRevision: true },
    }),
  );
}
export async function saveWorkspaceSettings(
  headers: Headers,
  id: string,
  input: z.infer<typeof workspaceSettingsInput>,
) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  return workspaceContent(headers, id, async (tx) => {
    const member = await tx.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: id, userId: session.user.id },
      },
    });
    if (member?.role !== "owner")
      throw new WorkspaceDenied(
        403,
        "Only workspace owners can change settings",
      );
    const current = await tx.workspace.findUniqueOrThrow({
      where: { id },
      select: { timeZone: true, settingsRevision: true },
    });
    if (current.settingsRevision !== input.revision)
      throw new PlanningConflict(current);
    return tx.workspace.update({
      where: { id },
      data: { timeZone: input.timeZone, settingsRevision: { increment: 1 } },
      select: { timeZone: true, settingsRevision: true },
    });
  });
}
