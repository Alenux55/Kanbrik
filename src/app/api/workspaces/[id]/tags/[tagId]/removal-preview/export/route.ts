import { exportTagReview } from "@/server/tag-removal";
import { tagRemovalReviewInput } from "@/lib/tag-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody } from "@/server/workspace-http";
import { tagCSVResponse } from "@/server/tag-csv-http";
export const POST = (r: Request, { params }: { params: Promise<{ id: string; tagId: string }> }) => planningRequest(async () => {
  const p = await params, body = await mutationBody(r, tagRemovalReviewInput);
  return tagCSVResponse(await exportTagReview(r.headers, p.id, p.tagId, body.review));
});
