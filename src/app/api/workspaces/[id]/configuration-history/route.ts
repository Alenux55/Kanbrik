import { configurationHistory } from "@/server/work-lists";
import { planningRequest } from "@/server/planning-http";
import { workspaceResponse } from "@/server/workspace-http";
export const GET=(r:Request,{params}:{params:Promise<{id:string}>})=>planningRequest(async()=>workspaceResponse(await configurationHistory(r.headers,(await params).id)));
