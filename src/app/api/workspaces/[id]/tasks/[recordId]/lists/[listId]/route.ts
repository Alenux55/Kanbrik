import { workListHandlers } from "@/server/work-list-http";
const handlers=workListHandlers("task");
export const PATCH=handlers.PATCH;
