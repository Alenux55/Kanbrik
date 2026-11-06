import { projectDetail, updateProject } from "@/server/planning";
import { editProjectInput } from "@/lib/planning-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; recordId: string }> };
export function GET(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const { id, recordId } = await params;
    return workspaceResponse(await projectDetail(request.headers, id, recordId));
  });
}
export function PATCH(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const input = await mutationBody(request, editProjectInput);
    const { id, recordId } = await params;
    return workspaceResponse(await updateProject(request.headers, id, recordId, input));
  });
}
