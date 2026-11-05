import { accessibleWorkspaces, createSharedWorkspace } from "@/server/workspaces";
import { createWorkspaceInput, mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return workspaceRequest(async () => workspaceResponse(await accessibleWorkspaces(request.headers)));
}
export async function POST(request: Request) {
  return workspaceRequest(async () => {
    const body = await mutationBody(request, createWorkspaceInput);
    return workspaceResponse(await createSharedWorkspace(request.headers, body.name), 201);
  });
}
