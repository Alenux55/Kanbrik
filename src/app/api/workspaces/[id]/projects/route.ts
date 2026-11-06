import { listProjects, createProject } from "@/server/planning";
import { createProjectInput } from "@/lib/planning-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody, workspaceResponse } from "@/server/workspace-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, { params }: Context) {
  return planningRequest(async () => workspaceResponse(await listProjects(request.headers, (await params).id)));
}
export function POST(request: Request, { params }: Context) {
  return planningRequest(async () => {
    const input = await mutationBody(request, createProjectInput);
    return workspaceResponse(await createProject(request.headers, (await params).id, input), 201);
  });
}
