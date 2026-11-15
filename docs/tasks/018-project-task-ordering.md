# 018: Reorder project tasks and task-local subtasks

Status: Implemented and verified in the combined 014–018 candidate on 2026-11-14; independent coordinator review pending. The owner explicitly deferred intermediate review gates for this combined assignment.

## Outcome and confirmed boundaries

In Projects, drag root tasks to reorder them **within the same project** and subtasks **within the same parent task**. This changes sibling order only. It must not move a task to another project/workspace, reparent a subtask, turn a task into a subtask or change status. Standalone-task/project ordering, Board-card manual ordering and Calendar scheduling order are not assigned.

Read AGENTS.md, README, product/architecture/stack, the coordinator handoff and final reviewed tasks 013–017 contracts. Existing workspace/project/parent assignments remain immutable. Task 017 filters may affect visibility, so agree filtered-ordering behavior before integration.

## Recommended defaults

Recommended, not additional owner-confirmed policy: order is server-saved and shared by members rather than a private per-user sort; existing owner/editor content rights permit sibling reordering. Existing siblings start in their current creation-time/ID order, new siblings append, and explicit Move up/Move down controls provide keyboard/touch alternatives. Root tasks move visually with their existing subtree, without changing the children's relative order or parent IDs.

## Scope

### Sibling scopes and persistence

- Define server-owned ordering metadata for root siblings `(workspace, project, parent=null)` and child siblings `(workspace, parentTask)`, with same-project context validated too. Choose a scope-level order revision/rank scheme that supports atomic conflicts and deterministic display. Rows retain canonical task IDs; lists of task IDs are not a new task model.
- Migrate initial order without changing task text/status, work ownership/hierarchy, comments/lists/history, block references or timestamps merely for ordering backfill. Give new task/subtask creation a deterministic append under the shared workspace lock; creating a sibling advances the relevant order version.
- Persist a committed drag or explicit move, reload it in Projects and verify it from another authorized session. Do not promise that project ordering changes Board creation-order sorting, columns/statuses, Calendar positions or task due dates. Scope this slice to the project hierarchy.
- Validate source and destination/anchor IDs against the same complete active sibling set. Root-to-child, child-to-root, other-project, other-parent, standalone and foreign-workspace drops must reject/no-op with zero writes. Client drag boundaries are convenience; enforce every restriction on the server.

### Interaction and failure handling

- Keep title activation for editing and disclosure actions separate from reordering. Use clear drag affordances/activation thresholds that do not accidentally open an editor, select a new parent or interfere with vertical mobile scrolling. Keyboard/touch Move up/down can use the same server operation and permissions. Expand/collapse state and existing drafts must survive a reorder.
- Ordering must be based on the full sibling set, not a filtered/subset/paginated client array. Recommended first slice: disable reordering while a task filter is active or the sibling set is incomplete and explain how to clear/reload it. Do not rank only visible tag/project/text/status matches and scramble hidden siblings. A collapsed child list is not permission to move its parent into another hierarchy scope.
- Use an explicit expected group revision and stable move intent or equivalent reconciliation. Under the workspace lock/recheck, validate membership, active work/ancestors, both neighbors/position and current order. A concurrent reorder, sibling create/Trash/Restore or missing anchor produces a reviewable conflict/current order, not a silent last-writer overwrite.
- A no-op move generates no false event/revision. A committed move is one atomic operation; failure rolls back ordering, and lost-response retry reconciles the original outcome without reapplying it over a later member's reorder. Pending duplicate actions and obsolete account/target responses cannot release another group's/new account's locks or render stale order as saved.
- Keep ordering metadata/version separate from unrelated work/comment/list text revisions where possible. Do not bump every sibling's content revision or invalidate unrelated dirty editors just to move one row. Critically, do not mutate trashed member revisions and strand task 013's exact Restore batch checks. Record one meaningful reorder event for the moved task/scope under task 014's reviewed activity contract, not invented content edits to every sibling/subtask.

### Trash, access and integration

- Reordering never reactivates Trash work. Preserve ordering context when work enters Trash. Restore merges with the current active order without undoing later reorders: recommended policy is original relative placement when still valid, otherwise append restored siblings in their preserved relative order with clear feedback. Agree and document this policy before implementation rather than silently reshuffling existing work.
- Coordinate order-scope changes with actual task create/Trash/Restore operations atomically. Preserve original task IDs/relationships, comment/list values, tag associations/statuses and reserved time. Moving a root task within its project keeps each child's parent ID/order intact; moving a subtask affects only that parent's child order.
- Every read/write uses current membership, personal-owner predicates, server identity, expected-account rejection, strict bodies, exact mutation Origin, no-store replies and membership workspace lock/recheck. A group-order version or drag target cannot grant access or transfer ownership. An invalid anchor does not mean the entire workspace was revoked.
- Failed/unconfirmed optimistic UI must remain visibly unconfirmed and offer reload/retry without discarding work/comment/list drafts. Do not rebuild the hierarchy from an old response after navigation, filter change, account switch or access removal. Restore normal click/keyboard behavior after canceled or completed drags.

## Acceptance and verification

1. In a project with several root tasks and subtasks under multiple roots, reorder roots and reorder one parent's children; reload and verify from another member/session. Root subtrees retain their exact hierarchy and child order. Appending new work and deterministic migration defaults are verified.
2. Attempt every disallowed scope transition via both real dragging and forged API requests, including two projects in the same workspace and two parents in one project. All reject without changing ownership, project/parent/status/tags/content, another scope's order or Calendar data.
3. Exercise concurrent sibling edits/reorders/creation/Trash/Restore, deleted anchors, stale group revisions, a partial/filtered view, rollback and lost-response retries. No silent overwrite, duplicate event, rank collision/unstable order or unrelated task/comment conflict is introduced.
4. Verify preserved/restored sibling order without invalidating exact Trash batch restoration. Prior separate Trash groups and subsequent active reorders remain intact; no task or scheduled block is recreated.
5. Desktop/Android browser coverage includes real drag, cancellation, click/disclosure behavior, touch scrolling, explicit keyboard/touch moves, pending/failed/uncertain feedback, retained work/comment/list drafts, filter restrictions, Back/focus and obsolete account/selection replies. Test server denial after actual membership removal while a move waits on the shared lock.
6. Run additive schema/migration/client/preservation/drift checks and README lint/types/build, meaningful PostgreSQL/HTTP tests, affected Projects/Trash/activity/tags/lists/history/session and Board/Calendar regressions, then the final integrated browser suite. Record exact commands/counts and limits; no new application tests were run for this specification.

## Completion and boundaries

No project/workspace transfers, reparenting, deeper nesting, automatic completion, Board manual ranking, standalone-task ordering, project ordering, scheduling changes, permission-role redesign or offline edits. Task 016 handles statuses; revised task 017 handles custom tags and filters, not fixed Important/Urgent flags. Agree shared order/creation/Trash/API contracts before dependent implementation, update implemented documentation and actual evidence here, stage only task-owned changes and provide a commit message. Owner commits/pushes; independent review is required. No production/provider/deployment action.


## Combined assignment — 2026-11-14

The owner explicitly assigned tasks 014–018 together and chose "Implement all five, then return them for coordinator review." Implementation proceeds in dependency order; intermediate independent-review gates are deferred for this assignment, not claimed passed. The prior staged implementation/specifications are preserved. No subagents, commit/push, deployment or real-provider changes are included. Implementation is present; the completion record below distinguishes actual checks and remaining review. No intermediate independent approval is claimed.


### Adopted ordering contract for this implementation

Sibling scopes keep a full ordered ID sequence including inactive members. The active view projects that sequence; a move replaces only active slots, while Trash/Restore advances the group revision without changing the retained slots or unrelated work revisions. Restore inserts work in its retained slot among the current active order, preserving both the relative order of existing active siblings and the restored members. For example, A/B/C → Trash B → move C before A gives stored C/B/A; Restore yields C/B/A, preserving the newer C-before-A order. This retained-slot policy is an implementation default for review, rather than a new owner-confirmed product requirement; it deliberately avoids reconstructing an earlier full order or invalidating Trash member revisions. Filtered/incomplete groups cannot be reordered. Root standalone and project ordering remain outside scope.

## Completion handoff — 2026-11-14

Implemented shared separate-revision order for project roots and each parent's subtasks. Backfill preserves creation/ID order without content/history/time edits; new siblings append. Complete same-scope active source/anchor validation, workspace lock/reauthorization, stable move receipts, noops/conflicts and one moved-task activity event prevent cross-scope moves or replaying an old move over a later reorder. No unrelated sibling work/comment/list revision changes or Trash member rebasing occurs. Work Trash/Restore advances affected groups atomically and uses the retained-slot policy documented above.

Projects provides mouse handles/control-bar drop targets, explicit Move up/down controls, subtree-preserving root moves, independent child scopes and account-bound retained ordering proposals. Touch scrolling remains available. Filtered/incomplete views disable ordering with a clear action; refresh/retry/discard affects only that ordering proposal. Canonical title/disclosure/editor/Back behavior remains separate. Standalone roots/project order/Board order/reparenting are not implemented.

New HTTP coverage includes complete scope/cross-project/cross-parent/root-child/foreign denial, content independence, create/stale order, noops, later-reorder receipt replay, inactive slot/Restore exactness, SQL full-array enforcement, transaction rollback and actual membership removal while waiting on the lock. Browser 3 scenarios passed both profiles: explicit/real desktop drag/cancel/root-child denial and another session; committed/lost response with newer collaborator order and retained work/comment/list input; filtered/incomplete/stale scope controls and explicit reload. The latest combined focused tag/order run passed all 6 ordering cases; the two tag locator failures were separately corrected. Physical touch dragging is not claimed: Android uses the explicit controls and touch scrolling.

### Verification shared by this candidate

Actual process-only local test-port override: `node .local/task014-command.mjs integration` / `browser …` (README equivalents `npm test` / `npm run test:e2e`). The guarded test database uses loopback 15432 because Windows reserves saved 55432; saved `.env`/`.env.test` values are unchanged. No reset/truncation or live-server/provider action occurred.

- Prisma client generation and schema validation passed on the final schema (7.10.1; no dependency/version changes).
- `npm run check` passed, including lint and strict types; final Webpack build passed. Default Turbopack, npm install/audit and Linux/container runtime were not rerun for this assignment.
- Final backend run: **128/128 tests, 13 files, 25.64 seconds, exit0**. New list HTTP coverage has5 scenarios; combined workflow/tag/order HTTP coverage has8. Existing activity9 and prior auth/invitation/session/membership/planning/Calendar/Trash checks are included.
- Fresh guarded database applied all 14 migrations; populated014→015→016–018 preservation/drift proof passed. Original full row digests across 18 populated014 tables and 23 populated015 tables survive; only newly added nullable activity subject fields were excluded where appropriate. A populated intermediate boolean implementation migrates Important/Urgent true values to ordinary tags with original work revisions/timestamps retained. Development upgrade retained original 18-table digests. Fresh/upgrade clusters 15434/15435 were stopped afterward. Ignored proof scripts/logs/databases are local artifacts, not application files.
- Final full integrated browser run: **135 passed / zero failures / three intentional Android mouse-only skips, 138 total, 30.2m, exit 0**. Both desktop Chromium and Pixel 7 profiles are included; [combined handoff](../handoff.md#combined-verification-record). This is a complete run on the final application and corrected test sources, separate from all earlier focused/interrupted attempts.

Limits: desktop Chromium and Pixel7 touch emulation, no physical Android; no Ubuntu/proxy/TLS/Mailcow or real SMTP delivery verification, commit, push or deployment. Configuration history shows latest 50 events. Drafts/filters are account-bound memory, not durable offline edits. Intermediate independent review was explicitly deferred by the owner; coordinator review remains pending.

Final cleanup: the owned portable PostgreSQL verification cluster and application/SMTP fixtures were stopped; no listeners remained on their verification ports. Final lint/types and schema validation passed again after the test-only fixture corrections. All candidate changes are staged for owner commit/coordinator review; no commit, push or deployment was performed.
