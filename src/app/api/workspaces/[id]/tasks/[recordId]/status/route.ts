import { updateTaskStatus } from "@/server/planning";
import { taskStatusInput } from "@/lib/planning-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
export function PATCH(request: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  return planningRequest(async () => {
    const input = await mutationBody(request, taskStatusInput);
    const { id, recordId } = await params;
    return workspaceResponse(await updateTaskStatus(request.headers, id, recordId, input));
  });
}
