import { z } from "zod";
const name = z.string().trim().min(1).max(100),
  text = z.string().trim().min(1).max(1000);
const revision = z.number().int().min(1).max(2147483646),
  id = z.string().min(1).max(200);
export const createListInput = z
  .object({
    name,
    kind: z.enum(["checklist", "shopping"]),
    requestKey: z.uuid(),
  })
  .strict();
export const editListInput = z
  .object({ name, archived: z.boolean(), revision })
  .strict();
const itemFields = {
  text,
  checked: z.boolean().optional(),
  quantity: z
    .number()
    .finite()
    .positive()
    .max(1000000)
    .multipleOf(0.001)
    .optional(),
  vendorId: id.nullable().optional(),
  purchased: z.boolean().optional(),
};
export const createItemInput = z
  .object({ ...itemFields, requestKey: z.uuid() })
  .strict();
export const editItemInput = z
  .object({ ...itemFields, archived: z.boolean(), revision })
  .strict();
export const createVendorInput = z
  .object({ name, requestKey: z.uuid() })
  .strict();
export const editVendorInput = z
  .object({ name, archived: z.boolean(), revision })
  .strict();
export type VendorRecord = {
  id: string;
  name: string;
  revision: number;
  archivedAt: string | null;
};
export type ListItemRecord = {
  id: string;
  listId: string;
  kind: "checklist" | "shopping";
  text: string;
  checked: boolean;
  quantity: number | null;
  vendorId: string | null;
  purchased: boolean;
  revision: number;
  archivedAt: string | null;
};
export type WorkListRecord = {
  id: string;
  name: string;
  kind: "checklist" | "shopping";
  revision: number;
  archivedAt: string | null;
  items: ListItemRecord[];
};
export type WorkListsPage = { lists: WorkListRecord[]; readOnly: boolean };
