export type WorkspaceRole = "owner" | "editor";
export type WorkspaceSummary = { id: string; name: string; kind: "personal" | "shared"; role: WorkspaceRole };
export type WorkspaceMember = { id: string; name: string; email: string; role: WorkspaceRole; isYou: boolean };
export type WorkspaceDetail = WorkspaceSummary & { members: WorkspaceMember[] };
