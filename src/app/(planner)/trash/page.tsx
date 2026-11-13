import { TrashPlanner } from "@/components/trash-planner";
export const metadata = { title: "Workspace Trash" };
export default async function Page({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  return <TrashPlanner requestedWorkspace={(await searchParams).workspaceId ?? ""} />;
}
