import { addEditor } from "@/server/workspaces";
import { addEditorInput, mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return workspaceRequest(async () => {
    const body = await mutationBody(request, addEditorInput);
    return workspaceResponse(await addEditor(request.headers, (await params).id, body.email));
  });
}
