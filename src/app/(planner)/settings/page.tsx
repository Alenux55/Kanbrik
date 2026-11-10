import { UserSettings } from "@/components/settings";
import { headers } from "next/headers";
import { isInvitationAdmin } from "@/server/invitations";
import { AccountInvitations } from "@/components/account-invitations";
export const metadata = { title: "User settings" };
export default async function Page() { return <><UserSettings />{await isInvitationAdmin(await headers()) && <AccountInvitations />}</>; }
