import {previewWorkflow} from "@/server/workflows";
import {workflowProposal} from "@/lib/workflow-contracts";
import {planningRequest} from "@/server/planning-http";
import {mutationBody,workspaceResponse} from "@/server/workspace-http";
export const POST=(r:Request,{params}:{params:Promise<{id:string}>})=>planningRequest(async()=>workspaceResponse(await previewWorkflow(r.headers,(await params).id,await mutationBody(r,workflowProposal))));
