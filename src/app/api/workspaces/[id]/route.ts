import { readableWorkspace, Unauthenticated } from "@/server/workspaces";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workspace = await readableWorkspace(request.headers, (await params).id);
    return Response.json(workspace ?? { error: "Workspace not found" }, { status: workspace ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Unauthenticated ? "Sign in required" : "Workspace unavailable" }, { status: error instanceof Unauthenticated ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
