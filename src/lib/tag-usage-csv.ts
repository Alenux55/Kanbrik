import type { TagRemovalReport } from "./tag-contracts";

// Spreadsheet programs can ignore leading controls/whitespace before a formula.
// Quote every cell for CSV structure; prefix dangerous cells for spreadsheet data.
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function tagUsageCSV(report: TagRemovalReport) {
  const columns = [
    "Review identity",
    "Captured at (UTC)",
    "Tag ID",
    "Tag name",
    "Task ID",
    "Title",
    "Type",
    "Project ID",
    "Project",
    "Parent ID",
    "Parent",
    "Workspace ID",
    "Workspace",
    "Status ID",
    "Status",
    "State",
    "Task revision",
  ];
  const rows = report.rows.map((r) => [
    report.impactDigest,
    report.capturedAt,
    report.tagId,
    report.tagName,
    r.taskId,
    r.title,
    r.type,
    r.projectId ?? "",
    r.project,
    r.parentId ?? "",
    r.parent,
    r.workspaceId,
    r.workspace,
    r.statusId,
    r.status,
    r.state,
    r.revision,
  ]);
  // Include review metadata even for an unused definition.
  if (!rows.length)
    rows.push([
      report.impactDigest,
      report.capturedAt,
      report.tagId,
      report.tagName,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  return (
    "\ufeff" +
    [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
