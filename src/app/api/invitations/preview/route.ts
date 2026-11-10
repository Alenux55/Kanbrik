import { invitationOrigin, invitationRequest, invitationTokenInput, previewInvitation } from "@/server/invitations";
export async function POST(request: Request) {
  return invitationRequest(async () => {
    invitationOrigin(request);
    const input = invitationTokenInput.parse(await request.json().catch(() => null));
    return previewInvitation(input.token);
  });
}
