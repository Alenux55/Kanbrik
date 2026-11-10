import { acceptInvitation, invitationAcceptInput, invitationOrigin, invitationRequest } from "@/server/invitations";
export async function POST(request: Request) {
  return invitationRequest(async () => {
    invitationOrigin(request);
    const input = invitationAcceptInput.parse(await request.json().catch(() => null));
    return acceptInvitation(request.headers, input);
  });
}
