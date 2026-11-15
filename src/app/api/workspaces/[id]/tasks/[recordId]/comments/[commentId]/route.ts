import { activityHandlers } from "@/server/activity-http";
const handlers = activityHandlers("task");
export const PATCH = handlers.commentPATCH;
