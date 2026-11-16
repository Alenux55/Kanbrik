import { previewTagRemoval } from "@/server/tag-removal";
import { tagRemovalPreviewInput } from "@/lib/tag-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export const POST = (r: Request, { params }: { params: Promise<{ id: string; tagId: string }> }) => planningRequest(async () => {
  const p = await params, body = await mutationBody(r, tagRemovalPreviewInput);
  return workspaceResponse(await previewTagRemoval(r.headers, p.id, p.tagId, body.revision));
});
