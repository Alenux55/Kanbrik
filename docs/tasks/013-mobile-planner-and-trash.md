# 013: Visible mobile Calendar, scrolling Board and reversible work deletion

Status: Implemented and verified from `ac30934`; staged for independent coordinator review. Assigned by the owner on 2026-11-13. The pre-existing staged planning documents are preserved. Task 014 remains dependent on task 013 review.

## Outcome

Show a usable Calendar immediately on Android, let users scroll through all Board statuses without selecting tabs, and add reversible project/task/subtask deletion through Trash. Clearly distinguish moving work to Trash from removing its Calendar time block. Calendar work cards use click-to-edit and drag-to-schedule; completing a drag must not open an editor.

## Dependencies and inputs

Read AGENTS.md, README, product/architecture/stack, agent-workflow, the coordinator handoff, and tasks 011 implementation/review fixes and 012 invitations. Preserve independently reviewed history/session behavior at `75f678e` and the exact development-hostname configuration at `ac30934`. Use task 001's outcome/scope/acceptance/evidence format for completion.

Relevant implementation: `src/components/calendar.tsx`, `board.tsx`, `block-editor.tsx`, `entity-editor.tsx`, Projects/PlannerContext/PlanningDrafts, `src/server/planning.ts`, `calendar.ts`, `workspaces.ts`, planning/calendar contracts and workspace API routes, Prisma schema/migrations and existing desktop/Android browser fixtures.

## Confirmed requirements and proposed defaults

Owner-confirmed: mobile currently shows no Calendar; all Board statuses should be scrollable instead of individually selected; tasks/projects need deletion; deleting a project/parent task includes its tasks/subtasks; Trash must allow reversing that action. Calendar removal must keep the underlying work, with a short label such as **Remove**.

Further owner feedback on 2026-11-13: remove the separate Schedule [work] box; clicking the main work card opens its project/task/subtask editor, while dragging it schedules directly. Moving an existing Calendar block must not pop up an editor on release; deliberate single-click activation opens the block editor. Comments and edit history are assigned separately in [task 014](014-comments-and-edit-history.md), after this task's lifecycle contract is integrated.

Implementation defaults below are coordinator recommendations, not additional owner-confirmed policy: mobile starts in a day time grid; Board columns scroll horizontally; Trash belongs to the existing workspace and existing owner/editor content rights apply to moving/restoring work; there is no automatic purge/permanent-delete UI in this task; scheduled blocks remain with a clear **Work in Trash** state and retained links. Document any material change to these defaults before implementation rather than silently choosing a conflicting data lifecycle.

## Slice A: mobile Calendar and Board

### Calendar

- The current FullCalendar wrapper is `hidden ... lg:block`; below 1024px only an agenda exists, and its `<details>` can be collapsed. The View control can still say Week grid. The owner's screenshot shows exactly that misleading state. This is an existing responsive behavior, not a regression introduced by the HMR hostname change.
- Render a real time grid on narrow screens, defaulting to a single day on the first mobile visit. Keep date/Previous/Today/Next, the user's zone, selected workspaces and block activation available. Week may remain an explicit choice with contained scrolling; the selected View must match the rendered surface. Keep desktop's usable week grid.
- Agenda remains an accessible alternative with an explicit empty state; a collapsed disclosure must never be the only mobile schedule surface. Do not leave an apparently blank Calendar when blocks exist. If there are no blocks, show an empty grid/agenda message with New block/Schedule work actions.
- Preserve vertical touch scrolling and tap-to-edit. Retain explicit schedule/create/edit/move/remove controls without requiring touch dragging or desktop mouse gestures. Do not add touch dragging merely to satisfy the visibility fix. Resizing/switching views must preserve dirty/pending drafts and captured zones; do not override an explicit user view choice on every render.
- Use responsive height/width and constrained internal overflow. Verify the original roughly 645px screenshot width as well as Pixel 7/390px, landscape/tablet and desktop, including a resize across the 1024px breakpoint.

### Calendar work-card and gesture interactions

- Remove the separate per-card **Schedule [title]** button/box. The main work card is the click/tap/keyboard target for the canonical project/task/subtask editor, with its parent/workspace context and retained drafts. It must not open the block-creation form on an ordinary click. Reuse the shared editor rather than creating another task record/form.
- A real pointer drag of that same card schedules directly: blank time creates the existing one-hour idempotent block; an existing empty same-workspace block receives the assignment. Preserve rejection of occupied/foreign targets and all current status/workspace invariants. Drag completion/cancellation must not also dispatch the card's click action, open an editor or duplicate a write. A small pointer movement below the drag threshold remains a click.
- Remove redundant per-work Schedule boxes/list entries from the Calendar surface. Keep scheduling without drag through **New block** and the block editor's work selector; an accessible Schedule action within the canonical work editor is also acceptable. Touch and keyboard users must be able to choose work, date/time and save without restoring the removed per-card box. Do not make a drag gesture the only way to schedule.
- Moving/resizing an existing block, or directly dropping a new work assignment, saves without automatically mounting an editor during pending or successful states. Keep pending/saved feedback visible and prevent duplicate/conflicting writes. A deliberate later click/tap/keyboard activation opens exactly one editor; clicking blank time can still open New block.
- Source finding: `gesture()` calls `retainGesture()`, which unconditionally calls `setEditing(block.id)` before the request. `openNew(..., autoSave=true)` likewise sets editing before its direct-create path. Decouple recovery/draft retention from opening an editor; fixing only `eventClick` cannot remove that behavior. Also audit FullCalendar drag/resize lifecycle and residual date/event clicks, rather than relying only on the palette's separate dnd-kit suppression state.
- Failed, uncertain, conflicting, canceled, dirty-draft-blocked or ambiguous-DST gestures must preserve recoverable input and show an inline explanation with an explicit **Review change** / **Review draft** action. Open a recovery editor only when the user activates that action. Never auto-confirm an ambiguous occurrence, falsely acknowledge an unconfirmed save, erase an existing draft or suppress the next intentional click indefinitely. Preserve the task 011 history/focus and task 009 missing-block/access-recheck corrections.

### Board

- Replace narrow-screen status selection and hidden inactive columns with all five columns in stable order: Backlog, To do, In progress, Blocked, Done. Put them in one horizontally scrollable Board region; swiping moves through statuses without a click. This horizontal interpretation is the proposed default.
- Use readable column widths that fit most of a phone screen; allow vertical page scrolling through cards without five independently trapped vertical scrollers. Keep horizontal overflow inside the Board region, not the whole document. Preserve desktop columns.
- Keep headings, counts, project colors, filters, canonical statuses, keyboard focus and tap-to-open editors. Scrolling must not move a task or start a drag. Mouse dragging and explicit editor status changes retain their existing guards. A status shortcut may scroll a column into view, but cannot be required to reveal it.

## Slice B: Calendar Remove wording

- Block removal already exists in the block editor as **Remove block**; use visible **Remove**, with an accessible name/context identifying the time block. Keep the existing revision-safe confirmation and uncertain-removal recovery.
- Confirmation must say that only this time block is removed and the task/project is kept. The operation calls the block-removal endpoint only; it must not trash, delete or complete work or its other scheduled blocks.
- Keep assignment clearing distinct: clearing assigned work leaves an empty reserved block; Remove removes the reserved interval. Do not label either action Delete task. Existing work's editor offers Move to Trash separately.
- This task adds Trash for projects/tasks/subtasks, not time-block Trash or restoration of a previously removed block.

## Slice C: workspace Trash and subtree restoration

### Implementation contract (2026-11-13)

The implementation adopts the recommended preservation policy: existing blocks keep IDs, intervals and work references, with Work in Trash metadata; no permanent purge. Project/Task rows receive nullable deletedAt/trashBatchId metadata, and workspace-owned TrashBatch records retain the exact member IDs/revisions of one confirmed operation. Existing owners/editors use the established workspace lock/recheck. Active reads/writes include ancestor predicates, and database checks reject active descendants of trashed ancestors and new block assignments to trashed work.

Implemented API: GET `/api/workspaces/[id]/trash` lists batches; POST `.../trash/preview` takes `{kind: project|task, id}` and returns target/counts and an impact digest over current subtree and linked-block revisions. POST `.../trash` takes that target/digest plus a stable UUID requestKey. It recomputes the same impact under the lock, returns 409 on change, and uses the UUID as the operation batch for lost-response reconciliation. GET `.../trash/[batchId]` returns authorized read-only detail; POST `.../trash/[batchId]/restore` requires the batch revision. Restore checks the exact stored members and prerequisites, never includes other batches or recreates/reassigns blocks. Replaying a completed batch acknowledges that original operation without changing later Trash state.

### Data and visibility

- Use reversible soft deletion on the same authoritative Project/Task rows; do not copy work into another task model or use a new task status. Retain stable IDs, workspace/project/parent references, text and prior status. Add an additive migration with deletion/batch metadata adequate to restore exactly one confirmed operation. No database reset or rewrite of applied migrations.
- Moving a project to Trash includes its currently active project tasks and subtasks; moving a root task includes its currently active subtasks; moving a subtask affects that subtask. Confirm the target and affected counts before committing. Do not include unrelated standalone work or another project/workspace.
- Group affected records into one deletion batch so Restore reverses that operation together. Already-trashed descendants retain their original batch and must not be silently restored by a later project restore. Restoring a separate child batch while its required project/parent remains in Trash must offer the prerequisite restore or explain the conflict; never reparent/move records to bypass the invariant.
- Trash is an accessible workspace-scoped destination (for example a navigation entry with workspace selection), listing top-level batches and their contained-work counts and Restore. It must be usable on desktop and Android. There is no automatic expiration, permanent purge, retention promise or administrator-only role added by this slice.
- Exclude trashed work from ordinary Projects/Board, counts, search/filter choices, new parent/project selectors and Calendar work palettes. Apply active/ancestor predicates on the server for every applicable list/detail/mutation, including direct URLs. Authorized Trash reads are the explicit exception. Never treat a UI filter as authorization.

### Scheduled work and Restore

- Proposed preservation policy: moving work to Trash keeps scheduled blocks and their reference IDs intact, with a clear **Work in Trash** marker instead of an apparently active assignment. The time interval, workspace, label and zone metadata stay intact. Do not silently destroy reserved time or sever the references needed for reversal.
- New assignments/scheduling to trashed projects/tasks are rejected server-side. Existing blocks may still be removed or have assignment cleared; any schedule editing that retains an existing trashed reference must distinguish retention from a new assignment. The block UI links to the authorized Trash/Restore flow rather than opening an ordinary active editor for missing work.
- Restore returns the same work IDs/statuses/context to ordinary views. Still-linked blocks regain active work context automatically. A block removed or reassigned while the work was in Trash must not be recreated or overwritten by Restore. Do not rewrite/replay Calendar create-intent payloads or duplicate blocks during retries.

### Authorization, concurrency and failure handling

- Reuse server-verified identity, expected-account preconditions, exact mutation Origin checks, strict bodies, no-store responses and the membership workspace row lock/recheck for Trash preview, move and restore. Proposed rights match ordinary content edits: personal owner; shared owner/editor. Workspace membership remains mandatory, even for a record's original creator or deletion actor. Trash grants no invitations, membership or ownership changes.
- Preview the deletion impact server-side and confirm that same scope at commit under the workspace lock. Validate expected revisions/impact for the target, active subtree and relevant linked data; a new/edited child since confirmation must produce a reviewable conflict rather than expanding the deletion silently. Restoration also rejects a conflicting/obsolete batch or inaccessible/missing required ancestor.
- Update revisions for each work row whose Trash state changes. Stale edit/status/schedule operations must not reactivate trashed work; stale restore must not overwrite another member's later action. A rollback must leave both the subtree and references unchanged. Repeated/uncertain requests must be reconcilable by stable IDs/batch state, with no duplicate restoration or new records.
- Preserve dirty drafts and explicitly handle their conflict with Trash. Confirm pending requests cannot be dismissed/duplicated. After a confirmed move, retire only affected record/subtree drafts and update all current views; after failure show unconfirmed state and retain input. Obsolete account/range callbacks cannot clear another account's drafts or locks.
- Audit existing `entity-editor.tsx` initial-load 404 handling and other callers: a missing/trashed record with intact workspace membership is not a whole-workspace revocation. Recheck workspace access and reconcile that record only; genuine removal still clears protected workspace data. Do not regress the task 009 deleted-block correction.

## Acceptance and verification

1. At Android/390px and the screenshot width, Calendar immediately shows a real date/time surface with a saved block, without opening Agenda. Verify empty state, View changes, dates, tap-to-edit/schedule and containment. Desktop week and date/time-zone behavior still work; no physical-device claim without actual hardware.
2. On Android, swipe the Board to reach all five status headings/cards without selecting tabs. Vertical touch scrolling and tap editing remain usable; scrolling produces zero status writes and document width stays bounded. Verify keyboard and desktop movement too.
3. Calendar Remove deletes only the chosen block. Its work, status, other blocks and workspace remain unchanged; cancellation/failed/uncertain removal remain explicit. Assignment clearing leaves a block. Move to Trash is visibly separate.
4. Real PostgreSQL/HTTP tests cover project/task/subtask batches, already-trashed descendants, exact-scope conflicts, atomic rollback, restoration prerequisites, stale revisions, repeated requests, linked blocks/create intents, direct API visibility, foreign workspace/IDs/Origins/accounts and membership removal while waiting for the lock.
5. Desktop/Android browser flows cover move confirmation, cancel, Trash listing, subtree Restore, refresh/navigation persistence, dirty/pending/failure/uncertain states and cross-account invalidation. Include a two-member shared-workspace case and a stale editor opened before another member trashes/restores its record.
6. If a migration is introduced, verify existing fixture rows/relationships/timestamps/statuses are preserved, additive development/test migrations and schema drift/fresh-target checks per README/task conventions. Record exact counts and any allowed metadata-only changes; never reset the owner's database.
7. Browser checks must prove work-card click opens the canonical editor with zero schedule writes; drag to blank time or an empty block makes exactly one correct write and opens zero dialogs throughout pending/success, not merely after a transient popup closes. Existing-block move/resize also opens zero dialogs, and the next intentional click opens one. Include cancel, small pointer movement, touch scroll, keyboard scheduling, conflict/network failure and explicit DST review; retained proposals survive navigation without automatic editor activation.
8. Run README lint/types, schema/client, build, meaningful backend checks and focused mobile/lifecycle/history/session/Calendar/Board/invitation regressions, then the full integrated browser suite on final sources. Update status-tab/agenda-only/automatic-gesture-editor test assumptions without weakening prior permissions, conflict, touch or zero-write assertions. Record failures and actual final pass/fail/skip counts separately.

## Boundaries and completion handoff

Implement slices sequentially: mobile surfaces, Calendar click/drag behavior and Remove wording, then the documented Trash contract/API/data changes, then cross-view integration and full verification. No independent frontend/backend implementations before agreeing shared contracts. Do not deploy, change the owner's server/provider, add offline edits, purge work, custom statuses, task moves, recurrence or unrelated capture features. Comments/history are task 014; keep compatible stable work IDs and lifecycle metadata, but do not claim that feature implemented here.

Update README and implemented product/architecture contracts only when those behaviors exist. Keep progress/actual evidence here and current state in the main handoff; distinguish plans from shipped behavior. Stage task-owned changes and supply a commit message; owner commits/pushes. This planning handoff performed source review and documentation checks only for the new features; it did not implement them.


## Implementation handoff — 2026-11-13

Implemented from `ac30934` in the existing checkout. Task 014 remains a specification awaiting task 013 integration and independent review. No dependency/lockfile change, production deployment, server/proxy/firewall change or real-provider delivery was performed.

### Delivered behavior

- A visible mobile day grid, explicit day/week selection retained across resizing, contained narrow week scrolling, visible palette cards and Agenda/empty-state controls. Board keeps all five canonical statuses in a single horizontal region on phones, with ordinary vertical scrolling and existing mouse/editor/filter behavior.
- Main Calendar work-card activation opens its canonical editor. Desktop drops schedule directly; New block/work selection remains the touch/keyboard alternative. Retained gesture input no longer mounts an editor automatically, including failures, conflicts and DST ambiguity. Inline feedback and explicit Review actions remain available. Native/palette residual clicks are guarded; the next intentional pointer/key activation resets suppression. The keyboard reset uses capture because FullCalendar invokes eventClick from its own keydown handler.
- Calendar Remove identifies its block accessibly and confirms that work and other reservations remain. Trash is a separate work-editor action and navigation destination.
- Additive nullable Project/Task metadata and workspace-owned operation batches preserve canonical IDs, relationships, text and statuses. Server impact preview and confirmation digest prevent silently expanding a subtree after confirmation. Already-trashed descendants retain separate groups. Exact-member Restore enforces revisions/prerequisites and never reparents work or rewrites blocks/create intents. Stable operation keys and original restore revisions reconcile lost responses without replaying later state.
- Active server reads/selectors/mutations reject work with trashed ancestors. Database checks enforce active ancestors and new active assignments. Existing blocks keep intervals/references and Work in Trash metadata, while retention, clearing assignment and block removal remain available. An uncertain original Calendar create can still reconcile after its linked work enters Trash; it cannot create another block through that original key.
- Existing server identity/account/Origin boundaries, no-store responses, content/membership lock and post-wait authorization checks cover Trash. Account-scoped intents/locks survive planner navigation; failed saves remain unconfirmed. Confirmed moves retire only affected work/new-child drafts. Missing work triggers an access recheck, while genuine membership loss clears only that workspace. Unrelated and prior separate-batch drafts remain. Trash workspace selection is URL-scoped, so explicit workspace links override an earlier selection without changing the creation default.

### Checks actually performed

Windows, Node 24.19.0 / npm 12.0.2, existing PostgreSQL 17 portable installation. No database reset.

| Check | Actual result |
| --- | --- |
| `npm run db:generate` / `npm run db:validate` | Passed; Prisma 7.10.1 client and schema |
| `npm run db:migrate` / `npm run db:test:migrate` | Applied the eighth additive migration to separate development and guarded test targets |
| Populated upgrade fixture | Seven baseline migrations, one row in each of 14 legacy tables, then migration eight: all complete legacy-row digests preserved, excluding only the new nullable lifecycle columns. IDs, relationships, timestamps/subseconds, revisions, statuses and create-intent payloads preserved |
| Development preservation | All legacy table counts/digests unchanged; this development target was empty, so populated-upgrade evidence is the separate fixture above |
| Fresh target and drift | A separate guarded target applied all eight migrations; Prisma migrate diff reported no difference for fresh and populated-upgrade targets; owned temporary clusters stopped |
| `npm run check` | Passed, ESLint and strict Next/TypeScript checks |
| `npm run build` | Default Turbopack build passed on the final runtime, including keyboard capture and older retained-reference recovery |
| `npm run build -- --webpack` | Passed on corrected runtime sources |
| `npm test` | 106/106 passed (10 files): 94 existing checks plus 12 real PostgreSQL/HTTP Trash tests |
| Focused Trash browser run | 8/8 passed on desktop/Pixel 7 emulation; later linked-block Remove assertions are included in the final integrated run |
| Additional retained-reference / Remove checks | 4/4 passed across desktop and Pixel 7, including older out-of-range drafts and removing only one linked block |
| Workspace-link navigation | 2/2 passed across desktop and Pixel 7; Trash URLs honor explicit workspace links independently of the creation default, including failed loads and later membership removal |
| Focused gesture correction | 1/1 passed, including keyboard activation immediately after a real drop |
| Final integrated browser run | `npm run test:e2e`: 85 passed / 3 intentional Android mouse-only skips, 0 failures, 18.6 minutes, in one complete run on final runtime sources (44 desktop passes; 41 Android passes) |
| Screenshot / settled-layout inspection | Desktop Board/Calendar and Pixel 7 Board/390px/645px Calendar inspected. Additional isolated touch-profile check waited for grid sizing after resize: 645px grid/body 597/595px, 390px 342/340px, 844×390 landscape 796/794px; document containment passed. Its fixture and loopback app were cleaned up/stopped |
| `git diff --cached --check` | Passed; task-owned code/tests/docs staged with the owner’s original planning changes preserved |

The twelve new backend cases cover access/account/Origin/strict-body boundaries, personal/shared and foreign IDs, project/task/subtask groups, separately trashed descendants, prerequisite restores, stale work/batch revisions, linked-block impact changes, database constraints, move/restore rollback, concurrent/replayed keys, intact block/create-intent data and membership removal while actually waiting for the shared workspace lock. Browser cases cover width/breakpoint choices, actual Chromium touch input, canonical card activation, zero dialog mounts throughout held/successful/failed gestures, explicit DST recovery, lost-response retries across navigation, shared stale editors, failed Trash loads, genuine revocation and obsolete account callbacks against a newer pending save.

### Earlier failed/interrupted verification

These are development attempts, not final pass evidence. An early TypeScript check caught a leftover status-tab state setter after removing the tabs; it was removed before the later successful checks. The initial backend run had 105 passes and one failure because an old exact-key assertion omitted the two new nullable lifecycle fields; it now verifies those fields are null on active work. The focused browser attempts reported 21 passed/2 failed/1 skipped, then 9 passed/5 failed/2 skipped, 8 passed/4 failed/2 skipped, and 3 passed/4 failed/1 skipped. Corrections updated removed Schedule/status-tab assumptions, scoped duplicate grid/agenda/route-announcer selectors, explicitly entered non-drag times, measured coordinates after scrolling, used valid empty mutation bodies, checked request completion rather than a temporarily hidden session subtree, and used real touch down/move/up frames for horizontal swipe verification. Ambiguous time validation is required-input validation, not a disabled submit button. No permissions, zero-write, conflict or persistence assertions were removed.

Two early full runs were deliberately stopped after nine and 29 reported passes: source review found the keyboard capture-order issue, then a missing direct Trash/Restore link for an older out-of-range block draft whose metadata predated Trash. These are not integrated passes. The final 88-case run above includes the corrected runtime and added regressions. Immediate resize screenshots can capture FullCalendar before its resize debounce; separate settled-layout checks confirmed full-width grids without changing runtime/test sources after the integrated run.

### Limits and coordinator follow-up

Physical Android, Firefox/WebKit, the owner's Ubuntu deployment, actual HTTPS proxy/TLS and Mailcow delivery were not exercised. Mobile evidence uses Chromium Pixel 7 touch emulation plus 390/645/844/1023/1024/1440px responsive checks, including an 844×390 landscape viewport. Drafts remain memory-only; no offline edits, purge/expiration, task transfers, custom statuses or task 014 comments/history were added. Existing scheduled intervals can remain linked to Trash by the documented preservation policy. Independent coordinator review remains required before task 014.


### Ready for review

All implementation/verification work for task 013 is complete. The owner commits and pushes the staged changes. Apply the new migration through the existing README restart sequence before serving the updated build; no database reset is needed. Review the lifecycle, retained drafts, mouse/keyboard suppression and shared authorization before assigning task 014 runtime implementation.

Suggested commit message: `feat: improve mobile planning and add workspace Trash`
