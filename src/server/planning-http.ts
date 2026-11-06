import "server-only";
import { PlanningConflict, PlanningInputError } from "./planning";
import { workspaceRequest, workspaceResponse } from "./workspace-http";

export function planningRequest(operation: () => Promise<Response>) {
  return workspaceRequest(async () => {
    try { return await operation(); }
    catch (error) {
      if (error instanceof PlanningConflict) return workspaceResponse({ error: error.message, current: error.current }, 409);
      if (error instanceof PlanningInputError) return workspaceResponse({ error: error.message }, 400);
      throw error;
    }
  });
}
