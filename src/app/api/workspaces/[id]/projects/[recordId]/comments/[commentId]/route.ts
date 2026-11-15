import { activityHandlers } from "@/server/activity-http";
const handlers = activityHandlers("project");
export const PATCH = handlers.commentPATCH;
