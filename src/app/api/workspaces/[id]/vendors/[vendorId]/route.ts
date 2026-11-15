import { changeVendor } from "@/server/work-lists";
import { editVendorInput } from "@/lib/work-list-contracts";
import { planningRequest } from "@/server/planning-http";
import { mutationBody,workspaceResponse } from "@/server/workspace-http";
export const PATCH=(r:Request,{params}:{params:Promise<{id:string;vendorId:string}>})=>planningRequest(async()=>{const p=await params;return workspaceResponse(await changeVendor(r.headers,p.id,p.vendorId,await mutationBody(r,editVendorInput)));});
