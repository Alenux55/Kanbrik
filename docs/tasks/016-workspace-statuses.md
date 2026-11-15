# 016: Configurable workspace task statuses

Status: Implemented in the combined `186acc9` candidate and included in independently accepted `2742d15` on 2026-11-15 after the tag corrections. See [current handoff](../handoff.md) for coordinator checks, separately carried full-suite/upgrade evidence and limits. No deployment was performed by review.

## Outcome

Workspace members can use configurable task/subtask statuses instead of only the original five fixed choices. Provide status addition, editing and safe removal, with consistent behavior across Board, Projects, editors, Calendar, Trash and history. A combined Board displays the selected workspaces' distinct workflows without moving work between them.

## Dependencies and inputs

Read AGENTS.md, README, product/architecture/stack, agent-workflow, the coordinator handoff and final reviewed tasks 013–015 contracts. Audit `src/lib/task-statuses.ts`, planning/status contracts, the Prisma TaskStatus enum, every task/status API, Board filters/columns, Projects, Calendar metadata, drafts, Trash restoration and activity rendering. Agree the shared schema/API and migration contract before implementing UI consumers.

This is the owner's explicitly requested follow-up to the initial fixed-status rule in AGENTS.md/product/architecture. The installed initial behavior remains authoritative until the new migration/contracts are implemented and verified. Do not rewrite AGENTS.md merely to make this planning task pass; any durable policy adjustment belongs in the reviewed implementation and must state the scoped transition. Task 015 continues to exclude status configuration from its own scope.

## Confirmed requirements and recommended defaults

Confirmed: add, edit and remove Board statuses; definitions belong to each workspace rather than one application-wide set, even when several workspaces appear together.

Recommended initial design (not further owner-confirmed policy): workspace owners configure shared workflows; ordinary authorized editors can move/edit tasks using that workspace's active statuses. Personal owners configure their own workspace. Configurable properties are name, order and whether a status counts as completed, plus an explicit default for new tasks. New statuses start incomplete. Existing workspaces are seeded with the five current definitions, the existing order, To do as creation default and Done as completed. No custom transition rules, automation, assignee permissions, per-project workflows or public/global status management is assigned.

## Scope

### Definitions, completion and migration

- Introduce server-backed workspace-owned definitions with immutable IDs independent of name/order, configuration revision/lifecycle state and explicit completion meaning. Enforce same-workspace task/status references in the server and database. A Board column is a projection of canonical task status, not a second card-only workflow.
- Rename without assigning a new ID or silently moving tasks. Preserve stable ordering with explicit keyboard/touch controls as well as any optional dragging. Validate bounded nonempty names and deliberate duplicate-name handling inside a workspace; another workspace may use the same display name.
- Completion must use definition metadata, never a comparison with label text or a globally hard-coded ID. Renaming Done leaves its completion meaning intact. Allow multiple completed statuses if configured; do not mark every new custom status complete. Show completion/default properties clearly and preview the effect before changing the completion meaning of an in-use definition. Hide Done filters/counts must use the completion property, with appropriate wording.
- Maintain at least one active status and a valid active creation default. Recommended default is incomplete; replacing/removing that default requires an explicit replacement choice. Task creation and new subtasks resolve the destination workspace's saved default, not the viewing Board filter or another workspace's default. Parent and child statuses remain independent.
- Seed every existing workspace with the original Backlog/To do/In progress/Blocked/Done behavior, and bootstrap equivalent defaults atomically/idempotently for new personal/shared workspaces. Map all existing tasks, including Trash, without changing effective status/completion, work revisions/timestamps, block intervals, create-intent payloads or historical events merely for representation migration.
- Plan an additive/backfilled transition from the existing PostgreSQL enum and literal API contracts to workspace references; do not reset data, rewrite applied migrations, silently accept ambiguous legacy values or remove integrity checks. Define a deliberate compatibility/rollout boundary for old clients. Update all fixed-status consumers together, including activity before/after rendering and retained drafts.

### Workspace configuration and safe removal

- Provide an accessible status configuration area within workspace settings, with preview/save/cancel, add, rename, reorder, completion/default controls and removal. State that configuration affects all work in this workspace. Recommended shared owner-only configuration is separate from ordinary editor task-status writes; enforce the chosen permission on every API, not only UI controls.
- Removing a status archives its definition instead of destroying referenced identity/history. If active tasks use it, require an explicit active replacement in that same workspace, show affected task/subtask counts and confirm the exact impact. Never let occupied-column removal hide tasks or silently choose a different status.
- Compute impact server-side, validate configuration/affected-task revisions under the membership workspace lock and reject a changed set rather than expanding reassignment after confirmation. Reassignment updates canonical tasks/revisions and records real status changes transactionally in activity. Do not change ownership, project/parent relationships, comments, list values or scheduling. Stable operation identity must reconcile uncertain retries without repeating moves/events.
- Preserve original status references for work already in Trash and historical changes. Do not blindly rewrite trashed task revisions: task 013's restore batches expect exact member revisions. If a later Restore would expose an archived status, require an explicit active replacement for the affected restored work (or explicit reactivation of the definition), with reviewable impact and an atomic lifecycle/activity contract. Never strand a Trash batch or silently revive a removed column. Restore must preserve unrelated archived rows/sections, comments and block behavior.
- No permanent status purge is included. Archived labels/IDs remain available for authorized history/Trash display; new assignments to archived definitions are rejected. Re-enabling an archived definition may be offered explicitly; it must not reassign tasks that previously moved to a replacement.

### Single- and multi-workspace Board

- A single workspace displays its configured active statuses in order. A multi-workspace Board exposes the selected workspaces' distinct statuses with clear workspace labels/grouping. Recommended first version: workspace-grouped columns in one contained horizontal Board region, retaining readable desktop/mobile column widths and vertical card scrolling.
- Never merge different statuses merely because names match. Immutable workspace/status identity controls grouping and drop targets. If any visual grouping of common defaults is proposed later, it requires an explicit mapping/label/operation contract; do not guess it from labels or initial enum keys.
- Dragging a task can change only to an active status in that task's own workspace. Reject a foreign workspace's column with clear feedback and zero writes; never transfer ownership or create a local status automatically. Keyboard/touch editors list only valid statuses for the current work's workspace. Board workspace filters continue to control visibility, not authority or creation defaults.
- Refresh configuration/counts consistently after changes, remove obsolete drop targets and handle statuses archived while a card/editor is active. Preserve dirty work/comment/list input and stable selected IDs on a rename/reorder; reject or reconcile stale/archived selections before writing rather than trusting an old label/index. Failed configuration loads must not be rendered as an authoritative empty Board.

### Authorization, history and failure handling

- Reuse verified identity, current membership, expected-account rejection, exact mutation Origin, strict bodies, no-store responses and shared workspace locking/recheck. Check foreign/missing workspace/status IDs independently from client preferences. An old account's configuration/load/save response cannot populate a new account's Board or release its save locks.
- Status configuration has its own revisions and conflict review; renaming/reordering a definition does not fabricate a content edit on every task. Record configuration changes with an authorized workspace-level activity record; actual task reassignment emits target-level events under task 014's final reviewed event contract. Retain the status ID and appropriate historical label snapshots so later renaming/removal cannot rewrite the apparent past. Do not rebuild fictional past events from current labels.
- Keep pending/failed/uncertain configuration and bulk-change input visibly unsaved, with retry/reconciliation and no duplicate writes/events. Do not silently reset dirty forms during metadata refresh or discard task/comment/list drafts to resolve a workflow conflict. A missing status is not automatic workspace revocation; genuine membership loss still removes protected workspace data.

## Acceptance and verification

1. Create different workflows in two workspaces, rename/reorder a populated status and add custom open/completed statuses. Task/subtask editors, Board cards, completion filters/counts, Calendar context and history agree after refresh/reload/another session. New tasks use each workspace's own default; no name change alters completion by itself.
2. On a combined desktop/Android Board, distinguish identical status names in different workspaces, reach every column by ordinary scrolling and move a card only within its workspace. A foreign-column drop, touch swipe or configuration change causes zero ownership-transfer/scheduling writes.
3. Removing an empty or occupied status follows explicit confirmation/replacement rules. New work/edits after impact preview cause a conflict. Verify atomic rollback, lost-response retry and one committed event per actual reassignment; original task data and unrelated work remain intact.
4. Include Trash batches created before status retirement: Restore requires an explicit valid resolution when necessary and completes without corrupting member revision checks or recreating removed blocks. Prior history remains readable after status rename/archive, including legacy enum-era events.
5. Real PostgreSQL/HTTP coverage rejects nonmember/foreign workspace/status/default IDs, unauthorized shared configuration, forged fields/Origins and stale account/config/task revisions. Exercise membership removal while waiting for the workspace lock, concurrent status deletion/task movement/new task creation and exactly-once reconciliation.
6. Desktop/Android browser coverage includes owner configuration, editor limitations, touch/keyboard use, horizontal multi-workspace columns, dirty/pending/failed/uncertain forms, configuration refresh during task/comment/list editing, Back/focus, delayed obsolete replies and actual block scheduling unchanged.
7. Verify populated and fresh additive migrations preserve existing workspace/task/Trash/comment/list/history/block data and initial status/completion/default behavior. Run README client/schema/migration/lint/types/build and meaningful backend checks, affected Board/Projects/Calendar/Trash/activity/lists/session regressions and the final integrated browser suite. Record actual counts, compatibility limits and failed attempts separately; no new tests were run for this specification.

## Boundaries and completion

No new task model, work transfer, custom transitions, workflow automation, per-project workflow, custom project status field, status-triggered scheduling/completion cascades, permission-role redesign, permanent purge, offline edits or production/provider changes. Keep one canonical task and independent scheduling. Update implemented contracts/README and any applicable durable fixed-status rule only with the reviewed, verified migration/implementation; do not claim this planning document changes installed behavior.

Implement in bounded slices after prerequisites: shared contracts/migration/default bootstrap; configuration/impact and safe retirement; multi-workspace views/consumers; Trash/activity/draft compatibility; final integrated verification. Keep actual evidence here and current status in the handoff; stage task-owned changes, supply a commit message and leave commit/push/deployment to the owner. Independent review is required before dependent work.


## Combined assignment — 2026-11-14

The owner explicitly assigned tasks 014–018 together and chose "Implement all five, then return them for coordinator review." Implementation proceeds in dependency order; intermediate independent-review gates are deferred for this assignment, not claimed passed. The prior staged implementation/specifications are preserved. No subagents, commit/push, deployment or real-provider changes are included. Implementation is present; the completion record below distinguishes actual checks and remaining review. No intermediate independent approval is claimed.

## Completion handoff — 2026-11-14

Implemented data-preserving per-workspace definitions/default/completion metadata, new-workspace bootstrap, owner-only preview/apply with exact impact/revision/receipt, safe retirement and immutable historical identities. Existing five statuses/default `todo`/done semantics are preserved by migration without revising old work/history/UTC blocks. Multiple completed definitions are supported; completion consumers now use canonical DTO metadata. Board groups workflows by workspace; drop identities include both workspace/status and cannot transfer data. New work uses its destination default; stale editors keep selected IDs/base revisions until explicit review.

Active tasks in occupied retired statuses require explicit reviewed replacements and actual status history. Trash statuses/member revisions remain unchanged until Restore requires active replacements with an exact digest; status and lifecycle commit in one revision/event. Old history has legacy label fallback; new status events snapshot names. Configuration changes use independent revisions/history; no phantom per-task edits for label/default/completion-only changes. Bounds/default/name-swap policy is documented in product/architecture; AGENTS narrowly updates the original fixed-status policy for this feature and remains part of coordinator review.

New HTTP scenarios cover seeded/custom/default/completion/foreign and owner-only contracts, task/config impact races, retirement/Restore, noops/receipts and transaction rollback. Browser 3 scenarios cover shared workflow configuration/default/completion/legacy history, retirement with simultaneous work/comment/list drafts, explicit Restore, uncertain config retry after later config, foreign Board drop, editor-only rights and genuine revocation cleanup. They passed both profiles before the final integrated run. Initial tests used temporary dialog disappearance during identity checks as a save barrier; explicit closed-editor/server checks corrected those fixtures, without changing application saves.

Rollout: apply all 14 migrations, regenerate/build/restart together and reload old cached clients before using custom workflows/tags. Seeded literal IDs remain route-workspace-local; retired/unknown fresh choices reject. No cross-workspace mapping, permanent status purge, custom scheduling state or ownership transfer was introduced.

### Verification shared by this candidate

Actual process-only local test-port override: `node .local/task014-command.mjs integration` / `browser …` (README equivalents `npm test` / `npm run test:e2e`). The guarded test database uses loopback 15432 because Windows reserves saved 55432; saved `.env`/`.env.test` values are unchanged. No reset/truncation or live-server/provider action occurred.

- Prisma client generation and schema validation passed on the final schema (7.10.1; no dependency/version changes).
- `npm run check` passed, including lint and strict types; final Webpack build passed. Default Turbopack, npm install/audit and Linux/container runtime were not rerun for this assignment.
- Final backend run: **128/128 tests, 13 files, 25.64 seconds, exit0**. New list HTTP coverage has5 scenarios; combined workflow/tag/order HTTP coverage has8. Existing activity9 and prior auth/invitation/session/membership/planning/Calendar/Trash checks are included.
- Fresh guarded database applied all 14 migrations; populated014→015→016–018 preservation/drift proof passed. Original full row digests across 18 populated014 tables and 23 populated015 tables survive; only newly added nullable activity subject fields were excluded where appropriate. A populated intermediate boolean implementation migrates Important/Urgent true values to ordinary tags with original work revisions/timestamps retained. Development upgrade retained original 18-table digests. Fresh/upgrade clusters 15434/15435 were stopped afterward. Ignored proof scripts/logs/databases are local artifacts, not application files.
- Final full integrated browser run: **135 passed / zero failures / three intentional Android mouse-only skips, 138 total, 30.2m, exit 0**. Both desktop Chromium and Pixel 7 profiles are included; [combined handoff](../handoff.md#combined-verification-record). This is a complete run on the final application and corrected test sources, separate from all earlier focused/interrupted attempts.

Limits: desktop Chromium and Pixel7 touch emulation, no physical Android; no Ubuntu/proxy/TLS/Mailcow or real SMTP delivery verification, commit, push or deployment. Configuration history shows latest 50 events. Drafts/filters are account-bound memory, not durable offline edits. Intermediate independent review was explicitly deferred by the owner; coordinator review remains pending.

Final cleanup: the owned portable PostgreSQL verification cluster and application/SMTP fixtures were stopped; no listeners remained on their verification ports. Final lint/types and schema validation passed again after the test-only fixture corrections. All candidate changes are staged for owner commit/coordinator review; no commit, push or deployment was performed.
