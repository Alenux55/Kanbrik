import { verifiedSession } from "@/server/auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  // Never forward the library's response/headers: even disableRefresh can issue
  // cookie deletions for invalid/expired sessions. This endpoint owns every header.
  const headers = { "Cache-Control": "no-store" };
  try {
    const session = await verifiedSession(request.headers);
    return Response.json({ userId: session?.user.id ?? null }, { headers });
  } catch {
    return Response.json({ error: "Session verification unavailable" }, { status: 503, headers });
  }
}
