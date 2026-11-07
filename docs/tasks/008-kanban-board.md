# 008: Kanban board over canonical tasks

Status: Implemented as `500b136` and independently reviewed on 2026-11-06 with no actionable findings. Owner confirmed task 007 approval before runtime work began; implementation baseline `47993fa`. Next feature handoff: [009: Calendar time blocks](009-calendar-time-blocks.md).

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

The implementation evidence follows. The proposed following feature is a separately specified calendar/time-block scheduling slice; do not start it automatically.

## Implementation completion — 2026-11-06

- Owner explicitly confirmed 007 was approved before implementation. Repository handoff was stale about both its commit and review status; actual code baseline is `47993fa`. No independent review command/results were supplied for that approval, so none are invented here. Task 007's runtime implementation is unchanged and its public session/fetch interface is reused.
- New `src/components/board.tsx` and protected `/board` page replace the placeholder. Five desktop columns and mobile status tabs show canonical tasks/subtasks with authorized workspace/project/parent context, plain-text details, explicit controls, and mouse-only drag handles. Status saves confirm after commit. Saved/error feedback and moved-selector focus are provided. Same-column, Escape, and selection-change cancellation do not claim reordering or write new task order.
- New `src/server/board.ts` and `/api/board/preferences` GET/PUT implement verified-user selection, personal-only first default, explicit persistent empty selection, strict ownership-free input, deduplication, inaccessible-ID rejection/filtering, no-store responses, and last-committed preference semantics. Refresh removes old controls while its read is pending, fixing a real late-read/checkbox race found in Android verification. No task-content authorization is derived from saved filters.
- Added additive `202611060001_board_preference` and `BoardPreference` (user FK/PK and workspace ID array, user-delete cascade); no existing migration rewritten and no Card/BoardTask duplicate. Shared status-only operation in `planning.ts`, strict contract in `planning-contracts.ts`, and `/api/workspaces/[id]/tasks/[recordId]/status` PATCH change only status/timestamp/revision under the existing workspace lock/recheck and revision compare. Safe 409/404/401/403/412 behavior and account expectation remain in place.
- Selection generations/mount guards and the existing session epoch ignore obsolete loads/move callbacks. Workspace failures produce no editable stale cards and explicitly incomplete counts while retaining successful scopes. Actual revoked access clears options/cards. Global in-memory board task locks span selection/navigation; confirmed same-user saves signal current views without rebasing Projects drafts. Conflicts require Review saved version and a later explicit move; failures require Allow retry and an explicit new move. No automatic conflict retry.
- Installed exact stable `@dnd-kit/core@6.3.1`; utilities 3.2.2 and accessibility 3.1.1 are transitive lock resolutions. npm peer metadata and official core/sensor documentation were checked. Only MouseSensor (eight-pixel distance, dedicated handle) is enabled; keyboard/touch use native labeled selectors and status tabs. No sorting or calendar dependency installed. See stack.md for API source and compatibility evidence.

### Actual checks

- `npm run db:generate`, `npm run db:validate`, `npm run check`, default `npm run build`, and `npm run build -- --webpack` passed. Final regression server uses the Webpack build. Historical Turbopack helper-process failures are not claimed fixed.
- `npm run db:test:migrate` applied the additive migration to guarded local PostgreSQL 17.11 on loopback 55432. `node .local/task008-migration-check.mjs` (temporary ignored harness) seeded identity/session/workspace/project/task fixtures before applying the development migration via `prisma migrate deploy`, compared ordered full-row digests/counts of eight prior tables, and removed only its fixture afterward: all rows unchanged. Development data otherwise empty; Verification empty and unchanged. Local proof `.local/task008-migration-proof.json` is ignored, not a deploy artifact.
- `node .local/task008-fresh-migration-check.mjs` provisioned a separate disposable cluster on loopback 55434, applied all three migrations to guarded `kanbrik_test_008_fresh`, and ran Prisma schema diff: no difference detected. It stopped its own cluster afterward. Harness/data/proof are ignored local verification artifacts, not new application commands or a system service.
- Initial `npm run test`: **59/59 passed**, including all 55 prior protections and four new real PostgreSQL/HTTP board cases. They cover preference isolation, deduplication, persisted empty selection, strict/forged/foreign inputs, account expectations, anonymous/outsider rejection, status-only field preservation, independent child completion, competing text/status revisions, no stale-text copy, and a move confirmed blocked behind membership removal before returning 404 with unchanged revision. Preference IDs are pruned from response after actual removal. A new-sign-in preference assertion was added for the final regression run.
- Initial focused browser runs: first **4 passes / 2 failures** from asserting move count before verification allowed dispatch; replaced with observable request polling. Second **5 passes / 1 Android failure** exposed a real selection-refresh race; refresh now waits for a fresh selection before showing editable controls. These runs are not presented as a full pass. Final suite below covers both fixes plus actual desktop keyboard movement, 200-character titles, pointer dragging/server-record assertions, same-column/Escape/selection cancellation, persisted multi-selection/clear-all, conflicts/failure recovery, retained Projects draft revision, incomplete loads, and board-open delayed-cookie/account-switch/B-pending-lock isolation with real membership revocation.
- Final `npm run test`: **59/59 passed** in four files, including empty selection preserved through a new actual sign-in. Final `npm run test:e2e`: **40/40 passed in one full run (8.1 minutes)** against the final Webpack build, 20 desktop plus 20 Pixel 7 cases. All six new board cases and all 34 prior checks passed, with no focused repair rerun needed afterward. Actual keyboard and pointer moves were checked against server records; the former race and failure-path assertions passed on both profiles. Intentional bootstrap failures in retry tests produced expected sanitized server logs. Desktop and Android screenshots were inspected, including long titles and no unintended page overflow. `npm audit --omit=dev --json`: **0 production vulnerabilities**; eight existing moderate development-only linter-chain findings remain.

### Limits and next handoff

No real Android hardware, Ubuntu/Docker runtime, production deployment, real-provider mail, backups/restore, or separate review agent was used. All fixtures are owned disposable accounts/workspaces and guarded PostgreSQL; existing email tests stay loopback/memory-only. Touch uses explicit controls; mobile precision dragging is deliberately not offered. Counts are uncapped but incomplete on failed selected scopes. Calendar, deletion/archive/moves, manual ordering, custom status and offline editing remain unimplemented. Review the integrated board before assigning a separately specified calendar/time-block slice; it was not started.

Stage only this task's changed files and provide a commit message. Leave commits, pushes, external accounts/server configuration, and deployment to the owner.

## Independent coordinator review — 2026-11-06

Reviewed committed `500b136` with no actionable code findings. Independently passed `npm run check`, `npm run db:validate`, `npm run db:test:migrate` (no pending migrations), `npm run build -- --webpack`, **59/59** backend tests and **6/6 focused board browser cases** (1.4 minutes) across desktop and Pixel 7 touch emulation. These cover pointer/control moves, conflicts, retained Projects drafts, incomplete loads, delayed-probe/account-switch isolation and actual membership removal. Inspected both layout screenshots; the review left the working tree unchanged.

The coordinator did not repeat the implementer's full 40-case browser suite, default build, fresh-cluster/data-preservation proof, dependency audit, hardware Android or deployment/provider checks. On the subsequent task-009 preparation, HEAD and the clean tree were still `500b136`; these are the earlier review's actual results, not a new test run. The board is suitable as the calendar implementation baseline. Task [009](009-calendar-time-blocks.md) specifies the next feature; it is not implemented by this documentation change.
