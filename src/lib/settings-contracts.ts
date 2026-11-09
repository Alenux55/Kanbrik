import { z } from "zod";
import { zoneInput } from "./calendar-contracts";
export const plannerPreferenceInput = z
  .object({
    defaultWorkspaceId: z.string().min(1).max(200).optional(),
    timeZone: zoneInput.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export const workspaceSettingsInput = z
  .object({
    timeZone: zoneInput,
    revision: z.number().int().positive().max(2147483646),
  })
  .strict();
export type WorkspaceSettings = { timeZone: string; settingsRevision: number };
