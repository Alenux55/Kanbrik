import "server-only";
import { z } from "zod";
import { serverConfig } from "./config";
import { verifiedSession } from "./auth";
import { Unauthenticated, WorkspaceDenied } from "./workspaces";

export function workspaceResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function workspaceRequest(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof Unauthenticated) return workspaceResponse({ error: "Sign in required" }, 401);
    if (error instanceof WorkspaceDenied) return workspaceResponse({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return workspaceResponse({ error: "Check the required fields and remove unsupported fields." }, 400);
    return workspaceResponse({ error: "Workspace operation failed. Your change is not confirmed. Please retry." }, 503);
  }
}
export async function mutationBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!await verifiedSession(request.headers)) throw new Unauthenticated();
  if (request.headers.get("origin") !== new URL(serverConfig().baseURL).origin) throw new WorkspaceDenied(403, "Invalid origin");
  return schema.parse(await request.json().catch(() => null));
}
export const emptyInput = z.object({}).strict();
export const createWorkspaceInput = z.object({ name: z.string().trim().min(1).max(100) }).strict();
// Better Auth stores and queries email in lowercase; whitespace is trimmed here.
export const addEditorInput = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }).strict();
