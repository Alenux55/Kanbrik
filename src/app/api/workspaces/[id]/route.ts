import { readableWorkspace } from "@/server/workspaces";
import { workspaceRequest, workspaceResponse } from "@/server/workspace-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(async () => {
    const workspace = await readableWorkspace(request.headers, (await params).id);
    return workspaceResponse(workspace ?? { error: "Workspace not found" }, workspace ? 200 : 404);
  });
}
