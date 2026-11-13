import { restoreTrash } from "@/server/trash";
import { restoreTrashInput } from "@/lib/trash-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export function POST(request: Request, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  return planningRequest(async () => {
    const input = await mutationBody(request, restoreTrashInput);
    const { id, batchId } = await params;
    return workspaceResponse(await restoreTrash(request.headers, id, batchId, input));
  });
}
