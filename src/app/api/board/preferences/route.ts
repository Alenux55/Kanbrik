import { boardPreferences, saveBoardPreferences } from "@/server/board";
import { boardPreferenceInput } from "@/lib/planning-contracts";
import { mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return workspaceRequest(async () => workspaceResponse(await boardPreferences(request.headers))); }
export function PUT(request: Request) {
  return workspaceRequest(async () => workspaceResponse(await saveBoardPreferences(request.headers, (await mutationBody(request, boardPreferenceInput)).workspaceIds)));
}
