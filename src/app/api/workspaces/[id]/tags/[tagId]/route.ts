import { changeTag } from "@/server/tags";
import { editTagInput } from "@/lib/tag-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody,workspaceResponse } from "@/server/workspace-http";
export const PATCH=(r:Request,{params}:{params:Promise<{id:string;tagId:string}>})=>planningRequest(async()=>{const p=await params;return workspaceResponse(await changeTag(r.headers,p.id,p.tagId,await mutationBody(r,editTagInput)));});
