import { invitationOrigin, invitationRequest, revokeInvitation } from "@/server/invitations";
import { z } from "zod";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return invitationRequest(async () => {
    invitationOrigin(request);
    z.object({}).strict().parse(await request.json().catch(() => null));
    return revokeInvitation(request.headers, (await params).id);
  });
}
