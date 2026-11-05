import { leaveWorkspace } from "@/server/workspaces";
import { emptyInput, mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(async () => {
    await mutationBody(request, emptyInput);
    return workspaceResponse(await leaveWorkspace(request.headers, (await params).id));
  });
}
