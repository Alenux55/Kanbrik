import { createInvitation, invitationInput, invitationOrigin, invitationRequest, listInvitations } from "@/server/invitations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return invitationRequest(() => listInvitations(request.headers));
}
export async function POST(request: Request) {
  return invitationRequest(async () => {
    invitationOrigin(request);
    const input = invitationInput.parse(await request.json().catch(() => null));
    return createInvitation(request.headers, input.email);
  });
}
