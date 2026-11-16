"use client";
import type { TagRecord } from "@/lib/tag-contracts";
import { tagColor, themedTint } from "@/lib/project-palette";
export function TaskLabelBadges({ task }: { task: { tags?: TagRecord[] } }) {
  return (
    <span className="inline-flex max-w-full flex-wrap gap-1">
      {task.tags?.map((tag) => (
        <span
          key={tag.id}
          className="max-w-full break-words rounded border border-neutral-500 px-1 text-xs text-neutral-950"
          style={{ backgroundColor: themedTint(tagColor(tag.color)) }}
        >
          {tag.name}
          {tag.archivedAt ? " (archived)" : ""}
        </span>
      ))}
    </span>
  );
}
