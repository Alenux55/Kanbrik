import { calendarPreferences, saveCalendarPreferences } from "@/server/calendar";
import { calendarPreferenceInput } from "@/lib/calendar-contracts";
import { mutationBody, workspaceRequest, workspaceResponse } from "@/server/workspace-http";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return workspaceRequest(async () => workspaceResponse(await calendarPreferences(request.headers))); }
export function PUT(request: Request) { return workspaceRequest(async () => workspaceResponse(await saveCalendarPreferences(request.headers, await mutationBody(request, calendarPreferenceInput)))); }
