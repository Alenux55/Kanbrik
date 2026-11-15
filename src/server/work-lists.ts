import "server-only";
import type { Prisma, WorkListItem } from "@/generated/prisma/client";
import type { z } from "zod";
import type { WorkTarget } from "@/lib/activity-contracts";
import type {
  createListInput,
  editListInput,
  createItemInput,
  editItemInput,
  createVendorInput,
  editVendorInput,
} from "@/lib/work-list-contracts";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { targetWhere } from "./activity-events";
import { PlanningConflict, PlanningInputError } from "./planning";
import {
  workReadOnly,
  intent,
  remember,
  supplementalEvent,
  configurationEvent,
  fieldChanges,
} from "./extension-support";
const order = [{ createdAt: "asc" }, { id: "asc" }] as const;
const itemRecord = (row: WorkListItem) => ({
  ...row,
  quantity: row.quantity?.toNumber() ?? null,
});
async function listRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  target: WorkTarget,
  id: string,
) {
  const row = await tx.workList.findFirst({
    where: { workspaceId, id, ...targetWhere(target) },
  });
  if (!row) throw new WorkspaceDenied(404, "List not found for this work.");
  return row;
}
export function readLists(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const readOnly = await workReadOnly(tx, workspaceId, target);
    const lists = await tx.workList.findMany({
      where: { workspaceId, ...targetWhere(target) },
      orderBy: [...order],
      include: { items: { orderBy: [...order] } },
    });
    return {
      readOnly,
      lists: lists.map((row) => ({ ...row, items: row.items.map(itemRecord) })),
    };
  });
}
export function addList(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  input: z.infer<typeof createListInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const readOnly = await workReadOnly(tx, workspaceId, target),
      payload = { target, ...input },
      prior = await intent(
        tx,
        workspaceId,
        userId,
        input.requestKey,
        "list_create",
        payload,
      );
    if (prior)
      return {
        list: await listRow(tx, workspaceId, target, String(prior.id)),
        replayed: true,
        readOnly,
      };
    if (readOnly)
      throw new WorkspaceDenied(409, "Restore work before changing lists.");
    if (
      (await tx.workList.count({
        where: { workspaceId, ...targetWhere(target) },
      })) >= 20
    )
      throw new PlanningInputError(
        "This work has reached its 20-section limit, including archived sections.",
      );
    const saved = await tx.workList.create({
      data: {
        workspaceId,
        ...targetWhere(target),
        name: input.name,
        kind: input.kind,
      },
    });
    await supplementalEvent(
      tx,
      workspaceId,
      userId,
      target,
      "list_created",
      "list",
      saved.id,
      1,
      fieldChanges(null, saved, ["name", "kind"], {
        name: "List name",
        kind: "List type",
      }),
    );
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "list_create",
      payload,
      { id: saved.id },
    );
    return { list: saved, replayed: false, readOnly: false };
  });
}
export function changeList(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  id: string,
  input: z.infer<typeof editListInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    if (await workReadOnly(tx, workspaceId, target))
      throw new WorkspaceDenied(409, "Restore work before changing lists.");
    const current = await listRow(tx, workspaceId, target, id);
    if (current.revision !== input.revision)
      throw new PlanningConflict(current);
    const archivedAt = input.archived
      ? (current.archivedAt ?? new Date())
      : null;
    if (current.name === input.name && !!current.archivedAt === input.archived)
      return { list: current, changed: false };
    const saved = await tx.workList.update({
      where: { id, revision: input.revision },
      data: {
        name: input.name,
        archivedAt,
        revision: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await supplementalEvent(
      tx,
      workspaceId,
      userId,
      target,
      "list_updated",
      "list",
      id,
      saved.revision,
      fieldChanges(
        { ...current, archived: !!current.archivedAt },
        { ...saved, archived: !!saved.archivedAt },
        ["name", "archived"],
        { name: "List name", archived: "List archived" },
      ),
    );
    return { list: saved, changed: true };
  });
}
async function values(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  kind: string,
  input: {
    text: string;
    checked?: boolean;
    quantity?: number;
    vendorId?: string | null;
    purchased?: boolean;
  },
  current?: WorkListItem,
) {
  if (kind === "checklist") {
    if (
      input.quantity !== undefined ||
      input.vendorId !== undefined ||
      input.purchased !== undefined
    )
      throw new PlanningInputError(
        "Checklist items have only text and checked state.",
      );
    return {
      text: input.text,
      checked: input.checked ?? false,
      quantity: null,
      vendorId: null,
      purchased: false,
    };
  }
  if (input.checked !== undefined)
    throw new PlanningInputError("Shopping items use purchased state.");
  const vendorId = input.vendorId ?? null;
  if (vendorId) {
    const vendor = await tx.workspaceVendor.findFirst({
      where: { workspaceId, id: vendorId },
    });
    if (!vendor)
      throw new WorkspaceDenied(404, "Vendor not found in this workspace.");
    if (vendor.archivedAt && current?.vendorId !== vendorId)
      throw new PlanningInputError(
        "Choose an active vendor, or keep the item's existing archived vendor.",
      );
  }
  return {
    text: input.text,
    checked: false,
    quantity: input.quantity ?? 1,
    vendorId,
    purchased: input.purchased ?? false,
  };
}
async function itemEvent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  target: WorkTarget,
  before: WorkListItem | null,
  after: WorkListItem,
) {
  const display = async (row: WorkListItem | null) => {
    if (!row) return null;
    const vendor = row.vendorId
      ? await tx.workspaceVendor.findFirst({
          where: { workspaceId, id: row.vendorId },
          select: { name: true, archivedAt: true },
        })
      : null;
    return {
      ...itemRecord(row),
      vendor: vendor
        ? vendor.name + (vendor.archivedAt ? " (archived)" : "")
        : null,
      archived: !!row.archivedAt,
    };
  };
  const section = await tx.workList.findUniqueOrThrow({
    where: { id: after.listId },
  });
  const keys =
    after.kind === "checklist"
      ? ["text", "checked", "archived"]
      : ["text", "quantity", "vendorId", "purchased", "archived"];
  const old = await display(before),
    next = (await display(after))!;
  const changes = fieldChanges(
    old,
    next,
    keys,
    Object.fromEntries(
      keys.map((key) => [
        key,
        `${section.name} — ${after.text}: ${key === "vendorId" ? "Vendor" : key}`,
      ]),
    ),
  ).map((change) =>
    change.field === "vendorId"
      ? {
          ...change,
          beforeLabel: old?.vendor ?? "Unassigned",
          afterLabel: next.vendor ?? "Unassigned",
        }
      : change,
  );
  await supplementalEvent(
    tx,
    workspaceId,
    userId,
    target,
    before ? "item_updated" : "item_created",
    "item",
    after.id,
    after.revision,
    changes,
  );
}
export function addItem(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  listId: string,
  input: z.infer<typeof createItemInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const readOnly = await workReadOnly(tx, workspaceId, target),
      list = await listRow(tx, workspaceId, target, listId),
      payload = { target, listId, ...input },
      prior = await intent(
        tx,
        workspaceId,
        userId,
        input.requestKey,
        "item_create",
        payload,
      );
    if (prior) {
      const row = await tx.workListItem.findFirstOrThrow({
        where: { workspaceId, listId, id: String(prior.id) },
      });
      return { item: itemRecord(row), replayed: true, readOnly };
    }
    if (readOnly || list.archivedAt)
      throw new WorkspaceDenied(
        409,
        "Restore the work and list before adding items.",
      );
    if (
      (await tx.workListItem.count({ where: { workspaceId, listId } })) >= 200
    )
      throw new PlanningInputError(
        "This section has reached its 200-item limit, including archived items.",
      );
    const data = await values(tx, workspaceId, list.kind, input),
      saved = await tx.workListItem.create({
        data: { workspaceId, listId, kind: list.kind, ...data },
      });
    await itemEvent(tx, workspaceId, userId, target, null, saved);
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "item_create",
      payload,
      { id: saved.id },
    );
    return { item: itemRecord(saved), replayed: false, readOnly: false };
  });
}
export function changeItem(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  listId: string,
  id: string,
  input: z.infer<typeof editItemInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    if (await workReadOnly(tx, workspaceId, target))
      throw new WorkspaceDenied(409, "Restore work before changing items.");
    const list = await listRow(tx, workspaceId, target, listId);
    if (list.archivedAt)
      throw new WorkspaceDenied(
        409,
        "Restore this section before changing its items.",
      );
    const current = await tx.workListItem.findFirst({
      where: { workspaceId, listId, id },
    });
    if (!current)
      throw new WorkspaceDenied(404, "Item not found in this list.");
    if (current.revision !== input.revision)
      throw new PlanningConflict(itemRecord(current));
    const data = await values(tx, workspaceId, list.kind, input, current);
    if (
      JSON.stringify({
        ...data,
        quantity: data.quantity === null ? null : Number(data.quantity),
        archived: input.archived,
      }) ===
      JSON.stringify({
        text: current.text,
        checked: current.checked,
        quantity: current.quantity?.toNumber() ?? null,
        vendorId: current.vendorId,
        purchased: current.purchased,
        archived: !!current.archivedAt,
      })
    )
      return { item: itemRecord(current), changed: false };
    const saved = await tx.workListItem.update({
      where: { id, revision: input.revision },
      data: {
        ...data,
        archivedAt: input.archived ? (current.archivedAt ?? new Date()) : null,
        revision: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await itemEvent(tx, workspaceId, userId, target, current, saved);
    return { item: itemRecord(saved), changed: true };
  });
}
export function vendors(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, (tx) =>
    tx.workspaceVendor.findMany({
      where: { workspaceId },
      orderBy: [...order],
    }),
  );
}
export function addVendor(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof createVendorInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const prior = await intent(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "vendor_create",
      input,
    );
    if (prior)
      return {
        vendor: await tx.workspaceVendor.findFirstOrThrow({
          where: { workspaceId, id: String(prior.id) },
        }),
        replayed: true,
      };
    if ((await tx.workspaceVendor.count({ where: { workspaceId } })) >= 200)
      throw new PlanningInputError(
        "The workspace has reached its 200-vendor limit, including archived choices.",
      );
    if (
      await tx.workspaceVendor.findFirst({
        where: {
          workspaceId,
          archivedAt: null,
          name: { equals: input.name, mode: "insensitive" },
        },
      })
    )
      throw new PlanningInputError("An active vendor already has that name.");
    const vendor = await tx.workspaceVendor.create({
      data: { workspaceId, name: input.name },
    });
    await configurationEvent(
      tx,
      workspaceId,
      userId,
      "vendor_created",
      vendor.id,
      1,
      fieldChanges(null, vendor, ["name"]),
    );
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "vendor_create",
      input,
      { id: vendor.id },
    );
    return { vendor, replayed: false };
  });
}
export function changeVendor(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof editVendorInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const current = await tx.workspaceVendor.findFirst({
      where: { workspaceId, id },
    });
    if (!current) throw new WorkspaceDenied(404, "Vendor not found.");
    if (current.revision !== input.revision)
      throw new PlanningConflict(current);
    if (
      !input.archived &&
      (await tx.workspaceVendor.findFirst({
        where: {
          workspaceId,
          id: { not: id },
          archivedAt: null,
          name: { equals: input.name, mode: "insensitive" },
        },
      }))
    )
      throw new PlanningInputError("An active vendor already has that name.");
    if (current.name === input.name && !!current.archivedAt === input.archived)
      return { vendor: current, changed: false };
    const vendor = await tx.workspaceVendor.update({
      where: { id, revision: input.revision },
      data: {
        name: input.name,
        archivedAt: input.archived ? (current.archivedAt ?? new Date()) : null,
        revision: { increment: 1 },
      },
    });
    await configurationEvent(
      tx,
      workspaceId,
      userId,
      "vendor_updated",
      id,
      vendor.revision,
      fieldChanges(
        { ...current, archived: !!current.archivedAt },
        { ...vendor, archived: !!vendor.archivedAt },
        ["name", "archived"],
      ),
    );
    return { vendor, changed: true };
  });
}
export function configurationHistory(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, async (tx) =>
    (
      await tx.workspaceActivity.findMany({
        where: { workspaceId },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 50,
      })
    ).map(({ actorId, eventKey, ...row }) => {
      void eventKey;
      return { ...row, actor: { name: row.actorName, available: !!actorId } };
    }),
  );
}
