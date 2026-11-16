import { removeTag } from "@/server/tag-removal";
import { tagRemovalInput } from "@/lib/tag-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export const POST = (r: Request, { params }: { params: Promise<{ id: string; tagId: string }> }) => planningRequest(async () => {
  const p = await params;
  return workspaceResponse(await removeTag(r.headers, p.id, p.tagId, await mutationBody(r, tagRemovalInput)));
});
