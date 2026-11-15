import { activityHandlers } from "@/server/activity-http";
const handlers = activityHandlers("task");
export const GET = handlers.historyGET;
