import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Badge } from "@/components/ui/badge";
import { SignOut } from "@/components/sign-out";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { personalWorkspace, Unauthenticated } from "@/server/workspaces";
import { verifiedSession } from "@/server/auth";
import { PlanningDrafts } from "@/components/planning-drafts";
import { PlannerSessionBoundary } from "@/components/planner-session";

export const dynamic = "force-dynamic";

export default async function PlannerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const session = await verifiedSession(requestHeaders);
  if (!session) redirect("/sign-in");
  let workspace;
  try { workspace = await personalWorkspace(requestHeaders); }
  catch (error) {
    if (error instanceof Unauthenticated) redirect("/sign-in");
    throw new Error("Workspace setup is temporarily unavailable. Refresh to retry.");
  }
  return (
    <PlannerSessionBoundary key={session.user.id} userId={session.user.id}><PlanningDrafts>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-neutral-200 bg-neutral-100 p-5 lg:border-r lg:border-b-0 lg:p-6">
            <Link href="/projects" className="inline-block rounded text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-teal-700">kanbrik<span className="text-teal-700">.</span></Link>
            <p className="mt-1 text-sm text-neutral-600">Space for what’s next.</p>
            <div className="my-6 rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Your personal space</p>
              <p className="mt-2 text-sm">{workspace.name}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-600">Private to your account. Manage shared access in Workspaces.</p>
            </div>
            <Navigation />
          </aside>
          <div className="min-w-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4 lg:px-10">
              <span className="min-w-0 break-all text-sm text-neutral-600">Signed in as {session.user.email}</span>
              <Badge className="border-amber-200 bg-amber-50 text-amber-900">Foundation preview</Badge>
              <SignOut />
            </header>
            <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-10 outline-none lg:px-10 lg:py-16">{children}</main>
          </div>
        </div>
    </PlanningDrafts></PlannerSessionBoundary>
  );
}
