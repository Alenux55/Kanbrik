import { blocks, createBlock } from "@/server/calendar";
import { rangeInput, createBlockInput } from "@/lib/calendar-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, { params }: Context) {
  return planningRequest(async () => workspaceResponse(await blocks(request.headers, (await params).id, rangeInput.parse(Object.fromEntries(new URL(request.url).searchParams)))));
}
export function POST(request: Request, { params }: Context) {
  return planningRequest(async () => workspaceResponse(await createBlock(request.headers, (await params).id, await mutationBody(request, createBlockInput)), 201));
}
