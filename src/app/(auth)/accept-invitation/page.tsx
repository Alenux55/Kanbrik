import { AcceptInvitation } from "@/components/accept-invitation";
export const metadata = { title: "Accept invitation", referrer: "no-referrer" as const };
export default function Page() { return <><h1 className="mb-6 text-3xl font-semibold">Accept your invitation</h1><AcceptInvitation /></>; }
