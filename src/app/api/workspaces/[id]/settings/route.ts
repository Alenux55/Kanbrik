import { workspaceSettings, saveWorkspaceSettings } from "@/server/settings";
import { workspaceSettingsInput } from "@/lib/settings-contracts";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
import { planningRequest } from "@/server/planning-http";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export function GET(request: Request, context: Context) { return planningRequest(async () => workspaceResponse(await workspaceSettings(request.headers, (await context.params).id))); }
export function PATCH(request: Request, context: Context) { return planningRequest(async () => workspaceResponse(await saveWorkspaceSettings(request.headers, (await context.params).id, await mutationBody(request, workspaceSettingsInput)))); }
