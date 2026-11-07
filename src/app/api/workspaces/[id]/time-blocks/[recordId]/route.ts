import { changeBlock } from "@/server/calendar";
import { editBlockInput, deleteBlockInput } from "@/lib/calendar-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; recordId: string }> };
export function PATCH(request: Request, { params }: Context) {
  return planningRequest(async () => { const input = await mutationBody(request, editBlockInput); const { id, recordId } = await params; return workspaceResponse(await changeBlock(request.headers, id, recordId, input)); });
}
export function DELETE(request: Request, { params }: Context) {
  return planningRequest(async () => { const input = await mutationBody(request, deleteBlockInput); const { id, recordId } = await params; return workspaceResponse(await changeBlock(request.headers, id, recordId, input, true)); });
}
