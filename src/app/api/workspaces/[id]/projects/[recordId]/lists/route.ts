import { workListHandlers } from "@/server/work-list-http";
const handlers=workListHandlers("project");
export const GET=handlers.GET;
export const POST=handlers.POST;
