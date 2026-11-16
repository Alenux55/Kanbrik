import { tagRemovalReport } from "@/server/tag-removal";
import { tagUsageCSV } from "@/lib/tag-usage-csv";
import { planningRequest } from "@/server/planning-http";
import { tagCSVResponse } from "@/server/tag-csv-http";
export const GET = (r: Request, { params }: { params: Promise<{ id: string; tagId: string; operationId: string }> }) => planningRequest(async () => {
  const p = await params;
  return tagCSVResponse(tagUsageCSV((await tagRemovalReport(r.headers,p.id,p.tagId,p.operationId)).report));
});
