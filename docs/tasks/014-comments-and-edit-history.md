# 014: Work-item comments and edit history

Status: Specification only; runtime implementation waits for independent re-review of [task 013's navigation correction](013-review-fixes.md). Owner-requested on 2026-11-13; not implemented. Task 013 is committed as `e4f7bfb`; its focused correction is implemented and verified in staged changes, awaiting coordinator approval. Implement this feature against that eventual corrected/reviewed successor, not an older checkout that omits Trash or Calendar fixes.

## Outcome

Projects, tasks and subtasks each have Comments and Edit history sections in their shared editor/detail view, consistently accessible from Projects, Board and Calendar. Comments show author, original posting time and the last edited time when edited. History shows who changed work, when and what changed, including meaningful before/after values.

## Dependencies and inputs

Read AGENTS.md, README, product/architecture/stack, agent-workflow, the coordinator handoff, task 013 and the reviewed task 011/012 contracts. Reuse canonical Project/Task IDs, authenticated workspace operations, revision/conflict handling, account leases, user-zone formatting and responsive editor behavior. Agree API/data contracts before separate UI/server implementation.

## Confirmed requirements and proposed defaults

Confirmed: comments and edit history on projects, tasks and subtasks; comments display original posting time and the time of any edit. Jira is an interaction reference, not a request for Jira's full feature set or integration.

Recommended first-version defaults: plain-text comments; all current authorized workspace members can read; existing content editors can post, and only a comment's author can edit their own comment while they retain access. Shared ownership grants no automatic right to rewrite another author's comment. No comment deletion, rich text, attachments, mentions, notifications or external Jira connection is assigned. History records changes made after this feature is enabled; historical edits cannot be reconstructed from current rows.

## Scope

### Comments

- Add workspace-owned persistent comments referencing exactly one existing project or task (subtasks use Task), with server-derived author, immutable created time, optional last-edited time and their own concurrency revision. Validate target/workspace consistency in the server and database; reject forged author/workspace/time fields.
- Show author and **Posted [time]** for every comment; show **Edited [time]** only after an actual saved text change. Preserve the original time. Use server-generated UTC instants, render in the viewing user's saved zone, and expose an unambiguous full timestamp. Retrying, reopening an editor or saving identical text must not fabricate an edit.
- Use bounded text validation and paginated/stably ordered lists. Escape text safely. Keep a failed new/edit draft visibly unsaved, preserve it while navigating within the same account, and block duplicate submissions. Use a stable create-intent/request key or equivalent server reconciliation so a lost response and retry cannot post twice.
- Only the authenticated author may edit their own comment, subject to current target/workspace permission and expected comment revision. A competing edit returns a reviewable conflict without overwriting newer text. Other members' comments remain readable, without active edit controls or a bypass through the API.
- Posting/editing a comment must not rewrite task text/status or bump a task's content revision merely to append a comment. Keep comment locking/revisions separate while preserving workspace authorization and atomic activity recording.

### Edit history

- Record append-only server-owned activity with target/workspace, actor, UTC time, action, work/comment revision as appropriate and field changes. Include work creation, title/description/status edits, Board status changes, Trash/Restore, and comment creation/editing. Attribute system/cascade actions clearly and correlate a subtree operation by batch; do not invent custom task statuses or count scheduling as task completion.
- Preserve before/after values for actual edits, including comment edits, without allowing users to replace the history. Show readable field names/status labels and expandable long-text changes. Do not emit a misleading content-edit entry for a failed/rolled-back request, no-op, list read, filter change or ordinary scheduling operation. Calendar block history itself is outside this task.
- Write an activity event in the same database transaction as each successful tracked mutation, across all relevant entry points; audit Projects, Board, Trash/Restore and comment endpoints rather than recording only shared-editor saves. A rolled-back mutation has no committed event; an idempotent replay has no duplicate event. History must be generated from trusted old/new records, not caller-supplied diffs or actor IDs.
- Existing work gets an honestly labeled baseline/availability boundary, never fictional past events or an invented original actor. Retain safe actor display when an account later becomes unavailable; never leak credentials, session/token values or unrelated user details into event payloads.
- Read history through workspace-authorized, paginated endpoints. Treat it as an application activity record, not a claim of tamper-proof compliance auditing or administrator surveillance.

### Trash, access and shared editors

- Moving work to Trash retains its comments/history. Proposed UI: read-only comments/history through authorized Trash detail, with comment changes blocked until Restore; restoration retains IDs, authors and original timestamps. Do not copy comments during restoration or delete history when hiding active work.
- Apply current membership and personal-workspace predicates to every comment/history read/write, direct ID and paginated continuation. Serialize protected operations with membership changes using the established workspace lock/recheck; expected-account headers only reject stale contexts and never grant access. Mutation Origin, strict input, safe errors and no-store responses remain required.
- Keep the existing editor's dirty/pending/conflict, native Back/history, focus and account-boundary behavior. Comment drafts and independent pending controls must participate in close/Keep draft/discard handling; editing a comment must not silently discard a dirty task form, and refreshing activity must not replace either draft. Never nest a second modal or add a public history URL to bypass context.
- Shared updates can use explicit Refresh activity; no live push is required. Stale/failed loads must be labeled, not shown as authoritative empty history. Late responses from another target/account must not populate the current editor or release another account's pending lock. True access loss removes protected content; a trashed/missing record with intact workspace access is reconciled separately.

## Acceptance and verification

1. All three work types expose Comments and Edit history on desktop and Android, including access from Projects/Board/Calendar. Post, refresh, sign in on a second session and verify durable content, author and original timestamp. Edit as author, verify edited timestamp and before/after event; original timestamp remains unchanged.
2. Meaningful PostgreSQL/HTTP coverage rejects foreign/nonmember workspaces, forged target/actor/timestamps, another author's edits, untrusted Origins and obsolete account headers. Exercise membership removal while a comment write waits for the lock, Trash restrictions and unchanged comments/history after subtree Restore.
3. Verify concurrent comment revisions, duplicate create retries after lost responses, atomic mutation/event rollback, one history event per actual change, no event for failed/no-op operations and safe pagination. Cover Board status writes and Trash/Restore cascades, not only direct text PATCH.
4. Browser checks on both profiles exercise failed/uncertain comment saves, two-member conflict/refresh, retained work/comment drafts, dirty/pending dismissal, native Back/focus, target switching, delayed old-account responses, and readable long activity without page-wide overflow. Verify correct user-zone display across two zones and a DST boundary.
5. Additive schema/client/migration checks must preserve existing work, Trash batches, blocks, memberships and original timestamps. Run README lint/types/build/backend checks, focused comments/history plus affected history/session/Board/Calendar/Trash/invitation regressions, then the final integrated browser suite. Report actual commands/counts and failures separately from carried evidence.

## Boundaries and completion

No task duplication, work moves, permission-role changes, retrospective reconstruction, comment purge, automatic notifications, rich-text stack, dependency replacement, offline editing or production/provider changes. Update implemented product/architecture/API contracts and README only after the feature exists. Keep completion evidence here, current status in the handoff, and stage only task-owned changes. Owner commits/pushes; independent review is required before dependent features.
