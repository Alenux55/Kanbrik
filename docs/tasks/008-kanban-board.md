# 008: Kanban board over canonical tasks

Status: Feature specification prepared; not implemented. **Dependency: task 007 must be implemented and independently reviewed before runtime implementation/integration of this board.**

Suggested model: GPT-6.1 Sol, High effort for board/data/concurrency integration. This document does not configure a model or start work.

## Independence from the session fix

The board's task/status/revision/workspace contracts are independent of how task 007 makes verification read-only. It consumes the corrected shared session/request abstraction and existing authorized content operations. Do not call or duplicate a particular auth verification endpoint inside board code. If task 007 changes the shared abstraction's public contract, reconcile this specification before starting.

## Outcome

Board replaces its placeholder with five fixed status columns over existing Task records. Users select one or more accessible personal/shared workspaces, see their tasks together, and change status through dragging or explicit controls. A move updates the same task shown in Projects; it never changes workspace/project/parent ownership or silently overwrites another edit. Calendar/time blocks remain a separate feature.

## Scope and recommended defaults

- Reuse central IDs/labels and column order: Backlog, To do, In progress, Blocked, Done. No configurable status or column system.
- Show standalone tasks, project tasks, and subtasks as individual cards under their own current status. Parents and children remain independent; moving one card never cascades status changes. Projects provide context labels, not separate project cards.
- Each card shows task title, workspace name, status, and project/standalone context. Subtasks show parent context even when the parent is in another column. Use text labels as well as any workspace color.
- Card details can show authorized plain-text task description and context in an accessible panel/dialog. Full title/description creation/editing remains in Projects in this slice. Do not invent board-only tasks or duplicate task content.
- Start with deterministic creation-time/ID ordering inside columns. Dropping within the same column does not save a new order; manual ordering, swimlanes, WIP limits, custom grouping and advanced filters are deferred.
- Live push/presence remains deferred. Fetch current data on opening/selecting the board, explicit Refresh board, and successful mutations as appropriate. Clearly indicate loading, incomplete loads, failures and save state.

## Workspace selection and preferences

- Offer checkboxes/multi-selection for currently accessible workspaces, with explicit active-selection labels and counts. First visit may select only the personal workspace by default; never silently select every shared workspace.
- Persist the user's confirmed board selection in server-backed account preferences so it survives normal reload/sign-in. Preserve an explicitly cleared selection as an empty board rather than reverting it to a default. This is a display preference and never grants membership.
- Keep preference ownership tied to the verified user. Reject forged preference-owner fields; validate/deduplicate selected IDs and prune/reject inaccessible IDs without exposing another workspace's name/data. Revalidate membership when reading tasks regardless of a saved preference.
- A small additive preference model/migration is acceptable if required; do not add BoardCard/BoardTask copies or modify canonical task ownership. Document the contract so Calendar can adopt a similar preference later without implementing Calendar now.
- Board selection is local to this view initially. It does not silently change Projects' single-workspace scope or claim a global calendar selection exists.
- For this low-impact preference, documented last-committed selection is acceptable across the same user's tabs. Do not apply that overwrite policy to tasks. An already-open tab need not change its selection through live push.
- Clearing all selections shows an explicit empty state. Workspace switches during a drag cancel the drag; late loads/move responses cannot reinsert cards from a no-longer-selected workspace.

## Canonical reads and access

- Reuse authorized workspace/task/project data operations, or add a deliberately scoped aggregate endpoint if justified. Every list/detail/card/count must come only from current accessible workspaces. A selected-ID array is not an access check.
- The shared owner and editor have the same existing task-edit rights. Anonymous callers get 401; inaccessible workspace/task IDs get safe 404. Personal-owner checks and owner-only membership administration remain unchanged.
- Keep user-specific responses uncached or safely scoped. Fetches/callbacks are bound to both the current verified account and current board selection/version; ignore superseded results.
- If a workspace returns revoked/unauthorized access, remove its cards/details from the working view and update the selection/options safely. A valid account session alone does not authorize its old workspace.
- If a selected workspace fails transiently, show that the board/counts are incomplete rather than reporting its task count as zero. Do not present failed/stale content as current editable data. Preserve successful results from other authorized workspaces only with clear load state.
- Do not silently cap loaded cards and show complete-looking counts. If limits/pagination become necessary, surface their effect and document the behavior.

## Status mutation contract

- Provide an intent-specific operation accepting only target status and expected task revision, returning the updated canonical task. A small `/tasks/[recordId]/status` route under the task's existing workspace scope is one possible route; document the chosen contract.
- Reuse shared authorization, strict input, trusted Origin, account-expectation rejection, workspace lock/recheck, and conflict handling. The board must not copy a stale title/description into a status update or create a weaker parallel authorization path.
- Atomically compare/increment the task revision and update only status (plus normal timestamp/revision). Preserve title, description, workspace, project and parent. Reject unsupported statuses/fields and IDs belonging to another workspace.
- Same-revision competing saves still yield one winner and a safe conflict. An outdated board card must not undo newer text or status changes from Projects/another board.
- Optimistic display is optional. If used, mark the card pending and roll back/reconcile failed moves without undoing a later successful operation or changing filtered-out workspaces. Prevent duplicate in-flight moves for the same task.
- On conflict, show the saved version/current status and require explicit refresh/review followed by another intentional move. Never automatically refetch and retry a stale move as an overwrite.
- Do not clear or rebase unsaved Projects drafts when a board status changes. Returning to Projects preserves the draft's original revision; its eventual save uses the normal conflict path if necessary.
- Use the corrected shared session boundary for all board requests/actions. Account changes, verification failures, logout, and obsolete completions must not leave a working old-account card, corrupt a new account's selection, or dispatch an old move under a new account.

## Desktop, touch, and keyboard behavior

- Desktop displays the five status columns and supports cross-column card dragging. Use a stable compatible dnd-kit integration from the established stack, installing only needed feature packages and recording exact versions. Do not add a second UI framework or calendar library.
- Every move is also available through an explicit labeled status selector/menu, usable by touch and keyboard. Successful/failed moves provide accessible feedback; focus returns sensibly after action/dialog closure.
- Android must have a usable narrow layout, such as selectable status tabs with counts and a card list, or clearly contained board scrolling. Avoid unintended page-wide overflow and do not make precision dragging essential.
- Touch scrolling and card activation must not accidentally move tasks. Use a deliberate drag handle/activation policy if touch drag is provided; cancellation leaves the task unchanged.
- Keep workspace/project/subtask context readable, including long titles. Do not infer meaning from color alone.
- Keep Projects, workspace management, identity/recovery, drafts and retry behavior functional. Calendar/Lists/Inbox remain explicit placeholders.

## Acceptance and verification

1. With personal plus at least two shared workspaces selected, task/subtask cards appear exactly once in their current columns with correct context. Deselection/clear-all and reload preserve the documented account-owned preference behavior. Another user's preferences/data are isolated.
2. A desktop drag and explicit keyboard/touch status control each update the canonical task. Projects and a later authorized reload show the same status/revision; parent/children, text and ownership remain unchanged.
3. Same-column drops, canceled drags, duplicate pending actions, and selection changes during a drag do not generate unintended writes or ordering claims.
4. Real PostgreSQL/HTTP tests cover the strict status-only update, unsupported fields/statuses, stale revisions, workspace/account isolation, and a move queued behind membership removal. Neither saved filters nor a matching account expectation grants access.
5. Browser tests cover a deterministic concurrent edit from Projects/another context, no automatic conflict retry, retained Projects draft, failed move recovery, and honest incomplete-load state.
6. Same-cookie account-switch and task 007's delayed-cookie protections remain effective with the board open and a move pending. An obsolete completion cannot restore old cards or overwrite a new account's preference/state.
7. Desktop and Android-emulated board journeys cover multi-selection, card context/details, explicit status changes, keyboard focus/feedback, scrolling/overflow and real pointer dragging where offered. Coordinate-based drag tests must assert the resulting server record, not just animation.
8. Additive migrations, if any, preserve existing data and run on fresh guarded test databases. Existing relevant unit/integration/full-browser checks pass; results distinguish focused/full runs and emulation/hardware.
9. Documentation accurately describes the board, refresh/selection/conflict behavior, fixed columns, ordering limits and remaining calendar scope. No placeholder claims unsupported behavior.

Use owned disposable accounts/workspaces/tasks and the guarded database; cleanup must not reset/truncate development or production data. Existing email tests stay on the memory-only loopback SMTP sink. A passing board happy path is not proof that the shared identity/permission regressions still work.

## Boundaries and handoff

No calendar/time blocks, card-to-calendar dragging, project cards, custom statuses/columns, manual ordering, task moves/reparenting/deletion/archive, rich text, checklists/inbox persistence, recurrence/due dates, new membership/registration policy, offline editing, real-provider mail, system services, or deployment. Do not bundle task 007's implementation into this feature diff; integrate its reviewed shared contract first.

Not completed. Record files/operations/migrations, actual status/preference/session integration contracts, verified task-revision and access-loss behavior, desktop/Android tests and exact counts, dependency versions, build results and limitations. The proposed following feature is a separately specified calendar/time-block scheduling slice; do not start it automatically.

Stage only this task's changed files and provide a commit message. Leave commits, pushes, external accounts/server configuration, and deployment to the owner.
