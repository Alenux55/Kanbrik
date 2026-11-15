import { readWorkflow,saveWorkflow } from "@/server/workflows";
import {saveWorkflowInput} from "@/lib/workflow-contracts";
import {planningRequest} from "@/server/planning-http";
import {mutationBody,workspaceResponse} from "@/server/workspace-http";
type C={params:Promise<{id:string}>};
export const GET=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await readWorkflow(r.headers,(await params).id)));
export const POST=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await saveWorkflow(r.headers,(await params).id,await mutationBody(r,saveWorkflowInput))));
