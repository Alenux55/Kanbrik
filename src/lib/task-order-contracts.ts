import {z} from "zod";
const id=z.string().min(1).max(200);
export const reorderTaskInput=z.object({taskId:id,beforeId:id.nullable(),revision:z.number().int().min(1).max(2147483646),requestKey:z.uuid()}).strict();
export type TaskOrderRecord={scopeKey:string;revision:number;ids:string[]};
