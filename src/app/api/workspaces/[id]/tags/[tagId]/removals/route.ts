import { z } from "zod";
import { tagRemovalHistory } from "@/server/tag-removal";
import { planningRequest } from "@/server/planning-http";
import { workspaceResponse } from "@/server/workspace-http";
export const GET = (r: Request, { params }: { params: Promise<{ id: string; tagId: string }> }) => planningRequest(async () => {
  const p = await params;
  const query = z.object({cursor:z.uuid().optional()}).strict().parse(Object.fromEntries(new URL(r.url).searchParams));
  return workspaceResponse(await tagRemovalHistory(r.headers,p.id,p.tagId,query.cursor));
});
