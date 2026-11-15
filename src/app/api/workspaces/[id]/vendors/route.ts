import { vendors,addVendor } from "@/server/work-lists";
import { createVendorInput } from "@/lib/work-list-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody,workspaceResponse } from "@/server/workspace-http";
type C={params:Promise<{id:string}>};
export const GET=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await vendors(r.headers,(await params).id)));
export const POST=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await addVendor(r.headers,(await params).id,await mutationBody(r,createVendorInput)),201));
