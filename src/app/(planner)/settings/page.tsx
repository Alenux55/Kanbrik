import { SettingsHub } from "@/components/settings";
import { headers } from "next/headers";
import { isInvitationAdmin } from "@/server/invitations";
import { AccountInvitations } from "@/components/account-invitations";
export const metadata = { title: "Settings" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; draft?: string }>;
}) {
  const params = await searchParams;
  return (
    <SettingsHub
      key={`${params.workspaceId ?? ""}:${params.draft ?? ""}`}
      workspaceId={params.workspaceId}
      draftKey={params.draft}
    >
      {(await isInvitationAdmin(await headers())) && <AccountInvitations />}
    </SettingsHub>
  );
}
