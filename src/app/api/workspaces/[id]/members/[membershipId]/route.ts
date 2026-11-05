import { removeEditor } from "@/server/workspaces";
import { emptyInput, mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; membershipId: string }> }) {
  return workspaceRequest(async () => {
    await mutationBody(request, emptyInput);
    const { id, membershipId } = await params;
    return workspaceResponse(await removeEditor(request.headers, id, membershipId));
  });
}
