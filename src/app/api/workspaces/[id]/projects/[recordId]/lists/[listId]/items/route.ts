import { workListHandlers } from "@/server/work-list-http";
const handlers=workListHandlers("project");
export const POST=handlers.itemPOST;
