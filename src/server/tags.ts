import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { createTagInput, editTagInput } from "@/lib/tag-contracts";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { PlanningInputError, PlanningConflict } from "./planning-errors";
import {
  intent,
  remember,
  configurationEvent,
  fieldChanges,
} from "./extension-support";
async function normalize(tx: Prisma.TransactionClient, name: string) {
  return (
    await tx.$queryRaw<
      { normalized: string }[]
    >`SELECT lower(btrim(${name})) AS normalized`
  )[0].normalized;
}
export function tags(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, (tx) =>
    tx.workspaceTag.findMany({
      where: { workspaceId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  );
}
export function addTag(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof createTagInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const prior = await intent(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "tag_create",
      input,
    );
    if (prior)
      return {
        tag: await tx.workspaceTag.findFirstOrThrow({
          where: { workspaceId, id: String(prior.id) },
        }),
        replayed: true,
      };
    const normalizedName = await normalize(tx, input.name);
    let tag = await tx.workspaceTag.findUnique({
      where: { workspaceId_normalizedName: { workspaceId, normalizedName } },
    });
    if (tag?.archivedAt)
      throw new PlanningInputError(
        "That name belongs to an archived tag. Restore it or choose another name.",
      );
    if (!tag) {
      if ((await tx.workspaceTag.count({ where: { workspaceId } })) >= 200)
        throw new PlanningInputError(
          "The workspace supports 200 tags including archived definitions.",
        );
      tag = await tx.workspaceTag.create({
        data: {
          workspaceId,
          name: input.name,
          normalizedName,
          color: input.color,
        },
      });
      await configurationEvent(
        tx,
        workspaceId,
        userId,
        "tag_created",
        tag.id,
        1,
        fieldChanges(null, tag, ["name", "color"]),
      );
    }
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "tag_create",
      input,
      { id: tag.id },
    );
    return { tag, replayed: false };
  });
}
export function changeTag(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof editTagInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const current = await tx.workspaceTag.findFirst({
      where: { workspaceId, id },
    });
    if (!current) throw new WorkspaceDenied(404, "Tag unavailable.");
    if (current.revision !== input.revision)
      throw new PlanningConflict(current);
    // Old archive clients may still archive an unused definition. In-use removal
    // requires a reviewed snapshot; rename/recolor is never bulk detachment.
    if (input.archived && !current.archivedAt && await tx.taskTag.count({where:{workspaceId,tagId:id}}))
      throw new PlanningInputError("This tag is in use. Open Settings, review Remove tag and its usage list before detaching assignments.");
    const normalizedName = await normalize(tx, input.name),
      duplicate = await tx.workspaceTag.findUnique({
        where: { workspaceId_normalizedName: { workspaceId, normalizedName } },
      });
    if (duplicate && duplicate.id !== id)
      throw new PlanningInputError(
        "Another tag already has that name, including archived definitions.",
      );
    if (
      current.name === input.name &&
      current.color === input.color &&
      !!current.archivedAt === input.archived
    )
      return { tag: current, changed: false };
    const tag = await tx.workspaceTag.update({
      where: { id },
      data: {
        name: input.name,
        normalizedName,
        color: input.color,
        archivedAt: input.archived ? (current.archivedAt ?? new Date()) : null,
        revision: { increment: 1 },
      },
    });
    await configurationEvent(
      tx,
      workspaceId,
      userId,
      "tag_updated",
      id,
      tag.revision,
      fieldChanges(
        { ...current, archived: !!current.archivedAt },
        { ...tag, archived: !!tag.archivedAt },
        ["name", "color", "archived"],
      ),
    );
    return { tag, changed: true };
  });
}
export async function validateTags(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  ids: string[],
  previous: string[],
) {
  if (new Set(ids).size !== ids.length)
    throw new PlanningInputError("Choose each tag once.");
  const definitions = await tx.workspaceTag.findMany({
    where: { workspaceId, id: { in: ids } },
  });
  if (
    definitions.length !== ids.length ||
    definitions.some((t) => t.archivedAt && !previous.includes(t.id))
  )
    throw new PlanningInputError(
      "A selected tag is unavailable in this workspace. Refresh tags and choose active definitions.",
    );
}
export async function assignTags(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  taskId: string,
  ids: string[],
) {
  await tx.taskTag.deleteMany({
    where: { workspaceId, taskId, tagId: { notIn: ids } },
  });
  const existing = await tx.taskTag.findMany({
      where: { workspaceId, taskId },
    }),
    have = new Set(existing.map((t) => t.tagId));
  await tx.taskTag.createMany({
    data: ids
      .filter((id) => !have.has(id))
      .map((tagId) => ({ workspaceId, taskId, tagId })),
  });
}
