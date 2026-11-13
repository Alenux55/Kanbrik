import { previewTrash } from "@/server/trash";
import { trashTargetInput } from "@/lib/trash-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return planningRequest(async () => {
    const input = await mutationBody(request, trashTargetInput);
    return workspaceResponse(await previewTrash(request.headers, (await params).id, input));
  });
}
