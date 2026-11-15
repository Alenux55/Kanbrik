import { z } from "zod";
export const tagName = z.string().trim().min(1).max(60);
export const tagColorKey = z.enum([
  "teal",
  "blue",
  "violet",
  "amber",
  "pink",
  "sky",
]);
export const createTagInput = z
  .object({ name: tagName, color: tagColorKey, requestKey: z.uuid() })
  .strict();
export const editTagInput = z
  .object({
    name: tagName,
    color: tagColorKey,
    archived: z.boolean(),
    revision: z.number().int().positive(),
  })
  .strict();
export type TagRecord = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  revision: number;
  archivedAt: string | null;
};
