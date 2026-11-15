import { tags,addTag } from "@/server/tags";
import { createTagInput } from "@/lib/tag-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody,workspaceResponse } from "@/server/workspace-http";
type Context={params:Promise<{id:string}>};
export const GET=(r:Request,{params}:Context)=>planningRequest(async()=>workspaceResponse(await tags(r.headers,(await params).id)));
export const POST=(r:Request,{params}:Context)=>planningRequest(async()=>workspaceResponse(await addTag(r.headers,(await params).id,await mutationBody(r,createTagInput)),201));
