import { tagRemovalReport } from "@/server/tag-removal";
import { planningRequest } from "@/server/planning-http";
import { workspaceResponse } from "@/server/workspace-http";
export const GET = (r: Request, { params }: { params: Promise<{ id: string; tagId: string; operationId: string }> }) => planningRequest(async () => {
  const p = await params;
  return workspaceResponse(await tagRemovalReport(r.headers,p.id,p.tagId,p.operationId));
});
