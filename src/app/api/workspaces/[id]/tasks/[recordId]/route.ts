import { taskDetail, updateTask } from "@/server/planning";
import { editTaskInput } from "@/lib/planning-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; recordId: string }> };
export function GET(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const { id, recordId } = await params;
    return workspaceResponse(await taskDetail(request.headers, id, recordId));
  });
}
export function PATCH(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const input = await mutationBody(request, editTaskInput);
    const { id, recordId } = await params;
    return workspaceResponse(await updateTask(request.headers, id, recordId, input));
  });
}
