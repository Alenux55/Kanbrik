import { activityHandlers } from "@/server/activity-http";
const handlers = activityHandlers("project");
export const GET = handlers.commentsGET;
export const POST = handlers.commentsPOST;
