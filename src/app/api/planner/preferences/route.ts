import { plannerPreferences, savePlannerPreferences } from "@/server/settings";
import { plannerPreferenceInput } from "@/lib/settings-contracts";
import { mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return workspaceRequest(async () => workspaceResponse(await plannerPreferences(request.headers))); }
export function PATCH(request: Request) { return workspaceRequest(async () => workspaceResponse(await savePlannerPreferences(request.headers, await mutationBody(request, plannerPreferenceInput)))); }
