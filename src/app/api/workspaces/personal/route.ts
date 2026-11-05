import { z } from "zod";
import { personalWorkspace, Unauthenticated } from "@/server/workspaces";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(serverConfig().baseURL).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!z.object({}).strict().safeParse(body).success) return Response.json({ error: "Expected an empty object; identity comes from your session." }, { status: 400 });
    return Response.json(await personalWorkspace(request.headers), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Unauthenticated ? "Sign in required" : "Workspace setup failed. Please retry." }, { status: error instanceof Unauthenticated ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
