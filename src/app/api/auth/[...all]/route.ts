import { authentication } from "@/server/auth";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";
async function handler(request: Request) {
  try {
    const url = new URL(request.url);
    const resetRequest = /\/(request-password-reset|reset-password)\/?$/.test(url.pathname);
    const resetCallback = url.pathname.startsWith("/api/auth/reset-password/");
    if (resetRequest || resetCallback) {
      const trusted = new URL(serverConfig().baseURL).origin;
      const destination = new URL("/reset-password", trusted).href;
      if (request.method === "POST") {
        if (request.headers.get("origin") !== trusted) return Response.json({ error: "Invalid origin" }, { status: 403 });
        if (url.pathname.endsWith("/request-password-reset")) {
          const body = await request.clone().json().catch(() => null);
          if (body?.redirectTo !== undefined && body.redirectTo !== destination) return Response.json({ error: "Invalid reset destination" }, { status: 403 });
        }
      }
      if (resetCallback && url.searchParams.get("callbackURL") !== destination) return Response.json({ error: "Invalid reset destination" }, { status: 403 });
    }
    return await authentication().handler(request);
  }
  catch { return Response.json({ error: "Authentication is temporarily unavailable. Please retry." }, { status: 503 }); }
}
export { handler as GET, handler as POST };
