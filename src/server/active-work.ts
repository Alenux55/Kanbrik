import "server-only";
import type { Prisma } from "@/generated/prisma/client";
export const activeProject = {
  deletedAt: null,
} satisfies Prisma.ProjectWhereInput;
export const activeTask = {
  deletedAt: null,
  AND: [
    { OR: [{ projectId: null }, { project: { deletedAt: null } }] },
    { OR: [{ parentId: null }, { parent: { deletedAt: null } }] },
  ],
} satisfies Prisma.TaskWhereInput;
