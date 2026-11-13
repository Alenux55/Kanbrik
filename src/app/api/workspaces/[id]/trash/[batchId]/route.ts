import { trashDetail } from "@/server/trash";
import { planningRequest } from "@/server/planning-http";
import { workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
export function GET(request: Request, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  return planningRequest(async () => {
    const { id, batchId } = await params;
    return workspaceResponse(await trashDetail(request.headers, id, batchId));
  });
}
