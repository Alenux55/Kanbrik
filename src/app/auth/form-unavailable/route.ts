import { serverConfig } from "@/server/config";

// Never read, echo, log or forward this body. Native fallback cannot sign in,
// create accounts, consume tokens, or set/renew any session cookie.
export function POST(request: Request) {
  const trusted = new URL(serverConfig().baseURL).origin;
  const status = request.headers.get("origin") === trusted ? 400 : 403;
  return new Response(
    "This form was not ready. Enable JavaScript, then go back and reload the page to continue.",
    {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
