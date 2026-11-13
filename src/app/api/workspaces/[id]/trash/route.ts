import { listTrash, moveToTrash } from "@/server/trash";
import { moveToTrashInput } from "@/lib/trash-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export function GET(request: Request, { params }: Context) {
  return planningRequest(async () => workspaceResponse(await listTrash(request.headers, (await params).id)));
}
export function POST(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const input = await mutationBody(request, moveToTrashInput);
    return workspaceResponse(await moveToTrash(request.headers, (await params).id, input));
  });
}
