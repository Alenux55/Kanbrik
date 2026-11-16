# 021: Reviewed tag removal, usage export and recovery

Status: Planned on 2026-11-15; implement after task 020 is integrated and reviewed. No runtime changes or application checks were performed for this specification.

## Outcome and confirmed decision

From Settings, remove a workspace tag with a warning when it is used, a downloadable list of affected tasks, and explicit Remove anyway confirmation. The owner confirmed **detach and archive; keep history**, rather than leaving the tag on existing tasks. No hard deletion of tag identity/history is authorized. Read AGENTS.md, README, product/architecture, tasks 013/014/017 and their review corrections, task 020, current handoff, `tags.ts`, `extension-support.ts`, tag/task contracts, activity, Trash and the migration constraints before choosing the data contract.

## Impact preview and export

- Add a server-authorized, read-only impact preview for a specific workspace/tag revision. Count distinct affected tasks/subtasks, distinguish active work from Trash, and show what Remove will do. Include all associations, not only the current view's project/tag/workspace filters. Empty tags can be removed with a simpler explicit confirmation.
- Offer Download usage list before confirming. Recommended format is UTF-8 CSV with task ID, title, task/subtask type, project and parent context, workspace, status name and Active/Trash state. Include capture time and a review identity; provide all rows, with no silent UI-page limit. Do not include credentials, user email lists, comments or unrelated content.
- Export and confirmation must refer to a defined snapshot. If work or associations change after preview/download, confirmation rejects the stale impact and asks for fresh review; a downloaded report is not a lock or guarantee that later data is unchanged. Authorize fresh download requests and prevent cross-workspace URLs/identities from exposing data.
- Quote CSV correctly, use a safe attachment filename and neutralize spreadsheet-formula cells (including formula prefixes hidden behind whitespace/control characters). Preserve readable titles without producing executable spreadsheet content. Downloading or previewing makes zero task/tag/history changes.

## Atomic detach and archive

- Confirm exactly the reviewed set under the existing workspace membership lock, rechecking access, tag revision/lifecycle, associations, affected task revisions and any affected Trash batch versions. New associations, edits, Trash/Restore or other changed impact must conflict rather than silently expand/shrink the operation.
- Remove the selected tag association from all affected active and trashed tasks/subtasks, and archive its definition without changing ID/name/color. Do not delete tasks/projects or touch other tags, hierarchy, status/completion, scheduling, lists/comments or sibling order. New assignments to the archived definition remain forbidden.
- Every actual task tag-set change advances that canonical task's revision and emits one truthful actor/time/before-after activity event, preserving historic label snapshots. Archive metadata uses its own revision/configuration history. No phantom events or revision changes for unaffected work.
- **Trash compatibility is required.** Existing Restore checks exact member revisions stored in each Trash batch. Detaching from a trashed task must update affected batch member snapshots and batch versions transactionally, after validating their current contents, so refreshed ordinary Restore remains possible. Preserve unrelated members and lifecycle/ancestry/status-resolution invariants. Stale pending Restore must conflict; do not bypass revision checks or silently rebase a retained Restore request. Roll back the entire operation if any batch cannot be reconciled safely.
- Use a stable operation identity and exact-payload receipt. A lost response can be reconciled after later edits without applying the detachment again, duplicating history, or undoing later reattachment after a tag is restored. Existing direct archive writes must not bypass the new removal rules: define an explicit compatibility boundary for old clients and reject an in-use legacy removal attempt that lacks reviewed impact. Do not silently reinterpret a general rename/recolor PATCH as bulk detachment.
- Choose/document practical bounds and transaction strategy. No silent partial removal or automatic continuation over an unreviewed set. If an impact is too large for the supported atomic operation, clearly refuse and leave data unchanged; do not hide the limit behind a timeout or claim success after partial work.

## Recovery and drafts

- Archived definitions remain visible/restorable in Settings with the same identity. Keep an authorized removal record/report of detached associations so users can inspect what changed after removal and recover assignments deliberately.
- Recommended first implementation: restore the tag definition, then reattach desired tags through normal task editors (restore work from Trash first when necessary). Clearly state that restoring a definition does **not** automatically retag every former task. The retained usage record/report supports this manual recovery. A bulk undo/reapply operation is deferred; do not invent automatic reattachment that overwrites newer choices.
- Existing task/comment/list/calendar drafts remain intact after bulk removal. A stale task draft that tries to reintroduce the removed tag must show the changed saved data and require explicit review, retaining input; do not silently drop its selections, rebase a work revision or revoke workspace access. Configuration dialogs retain failed/uncertain input and guard dismissal while pending.
- Metadata permissions follow existing workspace tag content rights (owner/editor); this is an adopted existing policy, not owner-only workflow administration. Recheck membership after waiting on the workspace lock. History/report reads remain workspace-authorized and session/account-bound.

## Acceptance and verification

1. Remove unused and used tags through Settings; cancel and download without writes. Verify complete reports across projects, standalone tasks, subtasks, multiple statuses and Trash, including long/unicode/quoted/multiline/formula-like titles and duplicate names in different workspaces.
2. Atomically detach exactly one tag, preserve all unrelated data/IDs/instants, and verify canonical Projects/Board/Calendar/filter results after reload/another session. Ordinary edits still obey revisions; real task/config history reflects only actual changes.
3. Race confirmation against new assignment, tag rename, task text/tag edit, membership removal, Trash and Restore. Stale impact rejects; fixture-scoped transaction failure rolls back every task, batch, definition, receipt and event. Lost-response replay stays exactly once after later changes.
4. Cover mixed/overlapping existing Trash batches: detach, refresh and Restore succeeds with correct remaining tags and exact member revisions; older pending Restore conflicts. Include archived workflow status resolution, removed Calendar blocks and independent sibling ordering.
5. Restore a definition and manually recover a selected assignment from the preserved usage record without reattaching others. Preserve original removal history and uncertain drafts; nonmember/foreign-account/Origin/body/ID requests and old unreviewed in-use archive writes reject on the server.
6. Desktop/Android UI, keyboard/touch, Back/focus, failed export/save and account switch must work. Run README schema/generation/migration/build/lint/types, meaningful PostgreSQL/HTTP tests and affected settings/tag/Trash/activity/order/session/browser cases. New persistence requires fresh and populated preservation/no-drift proof; never edit applied migrations or reset existing data.

## Handoff and boundaries

No permanent purge, task deletion, global tags, role redesign, automatic bulk undo or change to tag color/filter meaning. Record reviewed API/receipt/batch contracts and actual checks here and in product/architecture/handoff. Stage task-owned changes and return for independent review before dependent work; owner commits/pushes/deploys. This specification does not implement removal or authorize a server operation.
