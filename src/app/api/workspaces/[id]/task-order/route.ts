import {readTaskOrders,reorderTask} from "@/server/task-order";
import {reorderTaskInput} from "@/lib/task-order-contracts";
import {planningRequest} from "@/server/planning-http";
import {mutationBody,workspaceResponse} from "@/server/workspace-http";
type C={params:Promise<{id:string}>};
export const GET=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await readTaskOrders(r.headers,(await params).id)));
export const POST=(r:Request,{params}:C)=>planningRequest(async()=>workspaceResponse(await reorderTask(r.headers,(await params).id,await mutationBody(r,reorderTaskInput))));
