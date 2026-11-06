import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accessibleWorkspaces, Unauthenticated } from "@/server/workspaces";
import { ProjectsPlanner } from "@/components/projects-planner";

export const metadata = { title: "Projects" };
export default async function ProjectsPage() {
  let workspaces;
  try { workspaces = await accessibleWorkspaces(await headers()); }
  catch (error) {
    if (error instanceof Unauthenticated) redirect("/sign-in");
    throw error;
  }
  return <ProjectsPlanner workspaces={workspaces} />;
}
