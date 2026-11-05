import { authentication } from "@/server/auth";

export const dynamic = "force-dynamic";
async function handler(request: Request) {
  try { return await authentication().handler(request); }
  catch { return Response.json({ error: "Authentication is temporarily unavailable. Please retry." }, { status: 503 }); }
}
export { handler as GET, handler as POST };
