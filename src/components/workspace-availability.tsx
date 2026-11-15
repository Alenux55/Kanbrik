"use client";
import Link from "next/link";
import { usePlannerContext } from "./planner-context";
export function WorkspaceAvailability({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const context = usePlannerContext();
  if (!context.workspaces.some((w) => w.id === workspaceId))
    return (
      <section>
        <h1 className="text-3xl font-semibold">Workspace unavailable</h1>
        <p role="alert">
          Current workspace access is unavailable. Protected details and drafts
          have been removed.
        </p>
        <Link className="underline" href="/workspaces">
          Back to your workspaces
        </Link>
      </section>
    );
  return children;
}
