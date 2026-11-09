# 009: Calendar time blocks and work assignment

Status: Implemented as `82d60e4`, corrected as `da206b5`, and independently re-reviewed on 2026-11-08 without remaining actionable findings. Suitable as the baseline for subsequent work.

Suggested implementer: use the same model/effort recommendation as task 008 in [agent-workflow.md](../agent-workflow.md): High effort for scheduling, data relationships, permissions and concurrency. This file does not configure an agent or start implementation.

## Outcome

Users can create an empty calendar block (for example, noon to 3 PM), then assign an existing project, task or subtask from the same workspace by desktop dragging or explicit controls. They can adjust or remove the block without changing the referenced work. Calendar combines selected accessible personal/shared workspaces and works on desktop and Android.

## Dependencies and inputs

- Read `AGENTS.md`, [product.md](../product.md), [architecture.md](../architecture.md), [stack.md](../stack.md), [agent-workflow.md](../agent-workflow.md), and task [008](008-kanban-board.md), including its review evidence.
- Application baseline is `500b136`, including the additive BoardPreference migration and task 007's cookie-immutable session verification. The coordinator independently passed 59 backend checks and six focused desktop/Android board cases; the implementer separately reported a full 40-case browser pass. Do not conflate those runs.
- Reuse verified sessions, `PlannerSession.fetch`, account/epoch guards, strict Origin/input handling, workspace lock/recheck, revision conflicts and canonical Project/Task records. Inspect the actual shared contracts before extending them.
- Existing Board and Projects behavior must continue to work. This task owns Calendar, its time-block/preference data and APIs, relevant shared helpers, meaningful tests and documentation. It may adjust shared layout sizing where needed without redesigning the shell.

## Proposed defaults and ownership

These are bounded implementation defaults based on the existing architecture, not newly confirmed user requirements. Keep that distinction in completion notes. Surface a material departure before implementing it.

- Each block belongs to exactly one workspace, fixed at creation. Personal blocks are private to that workspace's owner. Shared blocks are visible and editable by its owner and editors, like shared tasks; they are a shared plan, not an individual member's availability reservation.
- A block is empty or references exactly one existing project OR task in the same workspace. A subtask uses its canonical task ID. A task assignment does not also store its project as a second assignment. Multiple blocks may reference the same work.
- Private scheduling of shared work through personal blocks is deferred. Do not copy a shared task into personal work or add cross-workspace references to simulate it.
- Calendar selection is separate from Board selection and Projects scope. Save selected workspace IDs and display time zone per verified user. First visit selects only personal; explicit empty selection persists. Same-user preference writes use last-committed semantics, as Board does.
- Allow overlapping blocks, including across workspaces. Display them accessibly; no availability/booking enforcement or automatic merging. Adjacent intervals are not overlaps. Use 15-minute snapping for pointer operations, while explicit controls can enter other minute values without silent rounding.
- One-off timed blocks only: no all-day events, recurrence, reminders, due dates, actual time tracking, assignees, resource lanes or external calendars.

## Data and integrity contract

Add a minimal `TimeBlock` model through a new additive migration; do not edit applied migrations. Suggested fields:

| Field | Contract |
| --- | --- |
| `id`, `workspaceId` | Stable ID and immutable ownership |
| `label` | Separate block label, trimmed 1–200 characters; default `Time block`, not a copy of a task title |
| `startAt`, `endAt` | UTC instants, with an explicitly documented PostgreSQL time-zone-aware mapping such as `timestamptz(3)` |
| `timeZone` | Valid IANA zone used to enter/edit this block; retains its scheduling context |
| `projectId`, `taskId` | Nullable references; at most one non-null, each in the block's workspace |
| `revision`, timestamps | Monotonic expected-revision edits and ordinary create/update metadata |

- Enforce end strictly after start, positive revision, mutually exclusive assignments, same-workspace references and immutable workspace ownership at the database as well as the server boundary where applicable. Use composite references to the existing `(id, workspaceId)` keys. Add indexes for workspace/range reads and references as appropriate.
- Derive linked work titles/context from current authorized canonical records on reads. Do not maintain calendar copies of task status, title or description. Renaming a task/project is reflected on refresh. Project/task revisions are unaffected by block changes, and scheduling never changes task status or completion.
- Block removal deletes only the block. Work deletion/archive remains unavailable; new block references must not silently enable destructive cascades from work. Use restrictive work-reference deletion behavior for this slice and test it. Workspace/user fixture cleanup may explicitly remove owned blocks before existing records.
- Preserve existing rows/data through migration and show a fresh guarded database can apply all migrations. Document SQL constraints and chosen native date types.

## Time zones and interval semantics

- Persist instants, not browser-local strings or server-local wall times. Read responses/range parameters use an explicit `Z` or numeric offset; schedule writes carry the editing zone's actual numeric offsets (or `Z` when that zone's offset is zero), as validated below. The server's OS time zone must not determine saved times.
- Calendar has one visibly labeled IANA display zone. On first visit, use a valid browser-detected zone, with UTC fallback; clearly distinguish the initial default from a saved preference. Applying preferences persists the chosen zone. Switching display zone changes presentation, not existing block instants, duration or revision.
- Forms show their editing zone explicitly. New blocks use the chosen display zone; existing blocks initially use their recorded zone. A display-zone change must not silently reinterpret a dirty form's input. Keep the form's original zone until the user intentionally changes it or discards the draft.
- Interpret date/time input with a tested zone-aware conversion utility. Reject nonexistent spring-forward wall times instead of normalizing them. For repeated fall-back times, show both occurrences with their offsets and require an explicit choice. Validate zone, local time and selected offset together on the server; an offset alone must not bypass the form's zone rules.
- For schedule writes, send unambiguous offset-bearing start/end plus the editing zone. Require offsets consistent with that zone at each instant. A valid interval may have different start/end offsets across a DST transition. Show actual elapsed duration; noon–3 PM on an ordinary day is three hours.
- Moving a block preserves elapsed duration; resizing changes the appropriate boundary. Explicit editing supports overnight and multi-day intervals, including DST crossings. Never silently substitute 24 hours for a local calendar day. If a pointer position is ambiguous at a DST transition, require explicit time confirmation before saving.
- Treat intervals and requested ranges as half-open: `[startAt, endAt)`. A range query includes a block exactly when `block.startAt < rangeEnd && block.endAt > rangeStart`. Include blocks spanning midnight or the entire range; do not query only by their start date. Compute day/week boundaries in the chosen display zone before converting them to instants.

## Server operations and preferences

Use workspace-scoped operations, for example `/api/workspaces/[id]/time-blocks` and `/time-blocks/[recordId]`. Document the final route/input/response contracts in architecture.md.

- GET collection requires explicit offset-bearing `start`/`end`, validates a positive range of at most 93 elapsed days, and returns all overlapping authorized blocks with current assignment context. No silent event cap. Work pickers use authorized canonical work, not just work with blocks in that range. Show incomplete pickers/loads honestly if they fail.
- POST creates an empty or explicitly assigned block with label, schedule, zone and nullable assignment. Derive actor/ownership from the verified session and route; reject forged user/workspace fields and cross-workspace IDs. Prevent duplicate in-flight creates. Use an idempotent create intent (for example, a stable request key unique within the workspace) so retrying the identical request after an uncertain response cannot create another block. Changed payload under the same key must not silently create/overwrite a different intent.
- PATCH accepts expected block revision and explicit changes. A suitable strict shape is `{revision, changes: {...}}`: label is independent; schedule changes include start, end and zone together; assignment changes include both nullable reference fields together. Require at least one actual change group and reject unsupported fields. Desktop schedule/assignment gestures send only their intended group, preserving other block fields.
- Compare/increment revision atomically for all edits, including assignment and unassignment. Shared concurrent label/schedule/assignment changes have one winner and a safe 409 current-state response, never a silent overwrite or automatic refetch-and-retry. Deleted/missing records return safe 404.
- DELETE requires expected revision, trusted Origin and an explicit UI confirmation identifying the block. Compare revision atomically before removal; stale deletion returns 409 and keeps the saved block. Return an unambiguous acknowledgement. Never delete, complete, detach or rewrite the referenced work as a side effect.
- All reads and writes enforce the existing workspace membership predicate. Mutations use the same workspace row lock/recheck as membership removal; a queued former editor must be denied. Linked-work validation occurs within that authorized transaction. Filters and a matching account header never grant access.
- Add separate user-owned Calendar preferences (selected IDs plus validated IANA display zone), reusing Board's strict ownership/deduplication/access-filtering semantics without overwriting BoardPreference. Prune inaccessible IDs from responses, preserve explicit empty selection, reject forged owner fields, and use no-store responses. Preference writes may race with removal; subsequent content operations always authorize independently.
- Retain the established safe 401/403/404/409/412/503 behavior, including account mismatch and sanitized failures. Do not weaken registration, cookies, recovery, or membership policy.

## User workflow and interactions

- Replace only the Calendar placeholder. Desktop provides a week time grid, a day view, previous/next and Today, visible date range/time zone/workspace labels, and explicit Refresh calendar. Android defaults to a usable day agenda with date navigation, start/end times and actions; a day grid may also be offered. No precision dragging is required on touch.
- Offer an explicit New block form with a clearly selected destination workspace even when several filters are selected. First create an empty noon–3 PM block, then assign it without recreating it. Also permit assignment during explicit creation. An empty workspace selection shows an empty state and a clear way to select a destination before creation.
- Provide a Calendar work picker/palette for projects, standalone/project tasks and subtasks, labeled with workspace and project/parent context. Initially offer all statuses, including Done, with status visible. Never imply that dragging a project schedules every child task.
- Desktop can drag a palette project/task onto an existing empty block. This updates that block's assignment, keeps its ID and interval, creates no extra event, and leaves the source work intact. Dropping on an occupied block or a block from another workspace performs no write and explains the valid alternative. Explicit controls can intentionally replace or clear an assignment.
- This palette is part of Calendar; cross-route dragging from the standalone Board page and a combined board/calendar screen are deferred. Reuse canonical IDs and visual conventions rather than creating a second task model.
- Desktop can move/resize saved blocks with deliberate pointer activation. Every assignment, unassignment, schedule edit and removal is also available through labeled keyboard/touch controls. Cancel, same-position drop and selection/range/context changes during a drag must not cause unintended writes. Avoid competing calendar and dnd-kit sensors/listeners; clean them up on unmount.
- Show pending state and prevent duplicate actions for the same block across selection/navigation. If the library temporarily moves an event optimistically, clearly mark it pending and reconcile/restore from authoritative state on failure; an old rollback must not undo a newer edit or restore a deselected workspace.
- Failed saves remain visibly unconfirmed with recoverable input. Conflicts show saved state beside the proposed change; require explicit review and a later intentional save. Never reset the user's input or claim a failed drag saved. For ambiguous create/delete responses, reconcile the original intent rather than blindly creating/removing again.
- Keep form drafts within the verified account's current in-memory session, including ordinary planner navigation, without rebasing them on a background update. Reuse/extend the draft provider carefully; do not mix block revisions with task revisions. Warn before document unload discards dirty input. Full reload/sign-out may discard drafts; no offline persistence is promised.
- Capture account, workspace, range/zone/selection version and record intent for asynchronous work. Ignore obsolete load/completion results, while still releasing only their own same-account pending locks. A committed save may prompt the current same-user view to reload; it cannot repopulate another selection or clear a new account's draft/lock.
- When one selected workspace fails, remove its stale editable content and label the calendar/counts incomplete while retaining clearly marked successful scopes. On confirmed 404/revocation, clear that workspace's blocks, picker content, details, drafts and options safely. A reference disappearing under revocation must not remain actionable.
- Manual refresh/opening/range or preference changes and own successful saves fetch current data; live push remains deferred. Refresh must not silently discard dirty forms or let a late preference read overwrite new user input. Maintain focus and accessible pending/saved/error feedback, and readable long labels without page-wide overflow.

## Library integration

Use the stack's FullCalendar Standard recommendation for the grid if compatible. Before installation, verify stable versions, React/Next peers and the APIs for that selected major, including named-zone support. Pin only the needed packages in the existing lockfile and record actual compatibility results in stack.md. Do not copy another major's imports or assume native Date parsing supplies the DST policy above. Use a maintained zone utility/integration if needed; avoid custom time-zone arithmetic.

Official references checked for this handoff on 2026-11-06: [time zones](https://fullcalendar.io/docs/timeZone), [external dragging](https://fullcalendar.io/docs/external-dragging), and [licensing](https://fullcalendar.io/license). External dragging can create a new event, so it does not establish the required existing-block assignment behavior. Standard non-premium plugins are MIT-licensed; Premium resource/timeline features are outside scope. No calendar package/version is selected, installed or verified by this document.

## Acceptance criteria

1. A personal and two shared workspaces can be displayed together, individually, or cleared; selection/time-zone preferences survive reload/new sign-in and remain independent of Board. Another user's preferences/data stay isolated.
2. Create noon–3 PM empty, assign a project by real desktop drag, then independently assign a task/subtask to another block using keyboard/touch controls. Assignment preserves the original block ID/interval and all canonical work fields/revisions/statuses. Repeated blocks can reference the same work.
3. Explicit and pointer move/resize persist the same instants/duration after reload; canceled/no-op/invalid-target gestures cause no writes. Unassign, replace and confirmed removal work through explicit controls. Block removal leaves project/task/subtask data intact.
4. PostgreSQL/HTTP tests cover strict inputs, forged IDs/owners, empty/both assignment cases, DB-level cross-workspace rejection, foreign-record reads/writes, anonymous/outsider/mismatched-account requests, invalid times, atomic conflicting edits/deletion, idempotent create retry, and a mutation confirmed queued behind membership removal before safe denial.
5. Deterministic tests cover a spring gap and both fall-back occurrences in a real DST zone, offset/zone mismatch, overnight/multi-day blocks, range boundary exclusion and spanning-block inclusion, differing client zones and a display-zone change that leaves instants unchanged. Test elapsed duration across DST, not just formatted strings; server environment zone must not change results.
6. Browser tests cover a retained dirty block draft, uncertain/failed saves, explicit 409 review, incomplete loads/pickers, revoked membership, rapid range/selection changes and a delayed obsolete mutation. Same-cookie account switch/logout, failed identity checks and task 007's delayed-probe protection remain effective with Calendar open and a block save pending; the new account's locks/drafts are isolated.
7. Desktop and Android-emulated journeys cover workspace selection, creating/assigning/editing/unassigning/removing a block, date navigation, clear-all, accessible feedback/focus, long labels and overflow. Desktop pointer assignment must assert the existing server block and unchanged block count, not just an animation or newly created event. Touch scrolling cannot accidentally reschedule work.
8. Existing checks and the full integrated browser suite pass on the final build. Distinguish focused repair runs from a single full pass and emulation from hardware. Migration evidence covers existing data preservation and fresh setup. Use only owned disposable fixtures and guarded databases; mail tests stay loopback/memory-only.
9. README, product/architecture/stack/roadmap and this task's completion record describe the actual implemented contracts, commands, defaults, test evidence and limitations. Keep unimplemented work clearly labeled.

## Verification and completion handoff

Use current README setup commands: client generation, schema validation, guarded migration, `npm run check`, production build, `npm run test`, and `npm run test:e2e`. Follow its documented Webpack fallback if necessary; do not claim an earlier bundler failure was fixed by a later successful build. Add focused scheduling tests as needed, then run the full suite after final integration. Never reset/truncate development or production data to make tests pass.

Record changed files/contracts, exact commands/results/counts, migration evidence, inspected layouts and remaining limitations here. Report failures and focused reruns honestly. Leave an independent-review handoff before any next feature. Stage only task-owned files and provide a commit message; the owner commits/pushes.

## Boundaries

No deployment/server services, provider email, authentication/registration changes, private scheduling of shared work, task/project deletion/archive/reparenting, custom statuses, manual board order, combined board/calendar screen, cross-route dragging, recurrence/all-day scheduling, actual timers, due dates, notifications, resource booking, external-calendar sync, checklist/inbox persistence, offline editing or SilverBullet integration. Removing a TimeBlock is the only new destructive domain action in this slice.

## Implementation completion record — 2026-11-06

### Delivered scope

- Additive `202611060002_calendar` creates workspace-owned blocks with `timestamptz(3)` boundaries, editing zone, label/revision/timestamps, exclusive composite work references, interval/revision/label checks and immutable-workspace/valid-zone trigger. Work-reference deletion is restrictive. Separate per-user Calendar preferences and a workspace-scoped persistent create-intent ledger preserve the canonical Project/Task model.
- New server operations/routes implement strict range/create/explicit-group patch/revision-checked delete and preferences. All reuse verified sessions, trusted Origin, account preconditions, membership locks/rechecks and safe response handling. The ledger returns the same original block for retries, rejects changed payload and cannot recreate a deleted block. Architecture documents exact shapes and status behavior.
- Calendar replaces its placeholder with FullCalendar Standard week/day grids on desktop and an Android day agenda, date navigation, separate workspace/zone preferences, explicit destination/create/edit/assign/replace/unassign/remove controls, same-workspace existing-block palette assignment and 15-minute move/resize. Scheduling/removal never changes canonical work status or revision. Overlaps and multi-day blocks are supported.
- Luxon wall-time conversion rejects gaps and requires explicit fold offsets. Server offsets must match the editing zone at each boundary. Local day/week boundaries account for DST, queries are half-open and include spanning blocks, moves preserve elapsed duration, and display-zone changes preserve saved instants. Weeks start Monday in both grid and API range.
- The existing account-scoped draft provider now retains Calendar base/revision/zone/input/intent, warns on document unload, and shares pending locks across route/selection changes. Changed groups only are submitted. Uncertain creates freeze their original payload; uncertain removals remain reconcilable through a retained-draft list even after navigation/outside the range. Conflicts require explicit review then a new save. Partial loads/pickers and revocation clear unsafe working content honestly. Obsolete range/account responses cannot repopulate another view or clear another account's draft/lock.
- Pinned compatible FullCalendar 6.1.22 family, Luxon 3.7.2 and types 3.7.6; registry peer/source/API checks are recorded in stack.md. README adds Calendar workflows and migration/restart guidance. Product/architecture/roadmap/handoff reflect implementation while retaining proposed-default distinctions. The coordinator's pre-staged 009 preparation and 008 review corrections were preserved.

### Verification evidence

- `npm run db:generate`: passed with Prisma 7.10.1.
- `npm run db:validate`: passed.
- `npm run db:test:migrate`: applied the fourth migration to guarded local `kanbrik_test`.
- `node .local/task009-migration-check.mjs` (ignored, guarded local development harness): applied only the new additive migration to nonempty `kanbrik_dev`; before/after complete-row counts/digests matched for user, account, session, workspace, membership, verification, project, task and BoardPreference. Eight tables had one owned fixture each; verification was empty in both snapshots. The owned fixture was removed afterward. No reset/truncate or earlier migration edit.
- `node .local/task009-fresh-migration-check.mjs` (ignored): a new isolated portable PostgreSQL 17.11 cluster on loopback 55434 applied all four migrations to guarded `kanbrik_test_009_fresh`; Prisma datasource-to-schema diff reported no differences. The temporary cluster was stopped; credential files/artifacts stay ignored.
- `npm run check`: lint and strict types passed. `npm run build` (default Turbopack) passed after the final source changes. An earlier `npm run build -- --webpack` also passed; it is not evidence of a final Webpack rerun. The first development Webpack attempt caught nullable Luxon ISO types, which were corrected. Historical bundler failures are not claimed fixed.
- `npm run test`: **74/74** checks passed across five files on the integrated Calendar build: the prior 59 plus nine real PostgreSQL/HTTP Calendar cases and six time/contract unit cases. Coverage includes both kinds of same-workspace reference, SQL rejection, restrictive work deletion, forged/foreign/anonymous/expected-account/Origin inputs, personal/shared access, preferences, create retries/deleted intents, concurrent edit/delete revisions, half-open/spanning/DST ranges, zone/offset validation, and a mutation observed blocked in PostgreSQL behind membership removal before denial.
- `npm run test:e2e`: **52/52 passed in one full run (10.8 minutes)** on the final default Turbopack build: all 40 existing cases plus 12 Calendar desktop/Android cases. No retries/skips/focused substitution. Calendar coverage includes real desktop pointer assignment (unchanged existing server ID/interval/count), move/resize and duration/reload, invalid/occupied targets, canceled/no-op/context-change gestures, keyboard assignment, controlled Android touch scrolling/date navigation, long-label overflow, unapplied invalid zone input, uncertain create/delete responses, retained/out-of-range drafts and removal reconciliation after navigation, explicit conflict review, failed pickers/scopes, late range/mutation responses, same-cookie delayed probe/account switch, failed checks, revocation and pending logout. Existing Board, planning, recovery, cookie-immutable renewal/expiry, workspace, retry, keyboard, navigation and 404 regressions also passed. The setup-error messages during the retry cases were deliberate fixture-scoped failures, followed by successful recovery assertions. Inspected final full-page Calendar captures on the 1440×900 desktop and Pixel 7 viewport profiles; Android is emulation, not hardware.
- `npm audit --omit=dev --json`: **0** runtime vulnerabilities. Full `npm audit --json` reported the same **8 moderate** development-only ESLint/minimatch-chain findings (expected nonzero audit exit). No forced audit upgrade.

Development failures were corrected rather than counted as passes: the first backend run had four failed assertions from using Vancouver as a 2026 fall-fold fixture. Current IANA rules make Vancouver permanent UTC−07, so deterministic spring/fall fixtures now use Los Angeles. Focused browser runs exposed duplicate target registration, long-label overflow/confirmation sizing, hidden resize handles, removed-event rendering, drag click-suppression timing and touch-test targeting. Some runs were interrupted after a known failure; no interrupted/focused result is presented as a full pass. The first full-suite attempt was stopped after two reported auth passes to repair the known Android touch fixture. A second was stopped after 16 reported cases (15 passes, one Calendar assertion failure): the assertion checked disappearance while identity verification hid the planner, before deletion completed. The UI now gives a confirmed removal notice and the test waits for that acknowledgement. A third was stopped after 16 reported passes to guard unfinished first-visit zone input before Apply; that path is now checked in every Calendar open helper. These interrupted attempts are not full passes.

### Limits and review handoff

- This original implementation record predates independent review. The coordinator review of `82d60e4` and corrective follow-up are appended below; acceptance still requires re-review.
- Browser verification uses Chromium desktop and Pixel 7 **emulation**, including dispatched touch input; no physical Android device, Firefox or Safari was tested. Screenshots are local ignored artifacts, not committed assets.
- Intl zone rules depend on current Node/browser data. Server mismatch is rejected, not silently reinterpreted; Node/browser updates may be needed after political zone changes. Calendar storage uses instants and remains independent of host local time.
- Drafts/locks are current-account memory only. Full reload/sign-out can discard them; an aborted client response does not roll back an already committed server transaction. Intent records have no expiry/retention job in this slice.
- Manual refresh only; no live push, offline editing, recurrence/all-day events, reminders, availability reservations, work deletion/archive/moves, later roadmap phases or production deployment. Docker, real SMTP delivery and the owner's Ubuntu instance were not changed or verified by this task.
- Owner commits/pushes. Stage task-owned files and retain existing coordinator documentation; never include ignored environment files, generated clients, local PostgreSQL data or browser artifacts.

Original pre-commit handoff: all task-owned changes are staged, including preserved coordinator preparation. `git diff --cached --check` passes. No commit, push or production deployment was performed. Suggested commit: `feat: add workspace calendar time blocks`.

## Coordinator finding and corrective follow-up — 2026-11-06

The coordinator independently reviewed committed `82d60e4` and found one **P2**: a gesture PATCH 404 was treated as revocation of the entire workspace. When a collaborator had deleted only the target block, Calendar removed the workspace and every draft in it despite the workspace endpoint still returning 200. Independent review passed lint/types, schema validation, migration status, Webpack build, 74 backend checks and 12 focused Calendar browser cases; it did not repeat the full 52-case suite. Those existing cases did not cover this deletion race.

The correction stays within task 009: a record-level gesture 404 now rechecks the workspace through the existing verified request boundary. Confirmed revocation still clears the affected workspace/drafts. Access 200 removes only the missing saved event and retains its proposed input, workspace selection and unrelated drafts. Failed access checks remain visibly unconfirmed and retain drafts. Recheck completions verify the current mounted scope/account; the shared revocation callback also ignores obsolete form callbacks after navigation. No schema, server authorization, dependency or deployment changes.

Permanent browser regressions create an owner/editor pair and use the owner's real DELETE while the editor's page has a stale block plus an unrelated dirty draft. Desktop exercises actual palette assignment; Android exercises explicit assignment. They also check a failed access recheck, genuine owner-driven revocation, and a held obsolete access result after a range change. All fixtures are owned and disposable; failure/held responses are browser-test interception only.

A pre-fix desktop run of `npm run test:e2e -- calendar.spec.ts --grep 'distinguishes collaborator-deleted' --project desktop` failed as expected, showing “Workspace access ended” and loss of the unrelated draft while the real workspace endpoint returned 200.

### Correction verification resumed — 2026-11-08

- The computer shutdown interrupted verification. The existing portable PostgreSQL cluster completed normal recovery on restart; the initial `pg_ctl` wait expired while recovery was still syncing, then `pg_isready` confirmed it accepted connections. No database reset or data-file removal. `npm run db:test:migrate` passed with four migrations and no pending changes.
- `npm run check`: lint and strict types passed on the final correction/test sources.
- `npm run build`: default Turbopack production build passed after restart. This is the build used for final verification; an earlier repair-stage Webpack pass is not a final Webpack rerun.
- `npm run test`: **74/74** backend/unit/HTTP/database checks passed across five files after restart.
- `npm run test:e2e -- calendar.spec.ts --grep 'distinguishes collaborator-deleted|obsolete workspace-access recheck|isolates pending saves'`: **6/6 focused cases passed (1.5 minutes)** across desktop and Pixel 7 emulation. The new navigation regression waits for the obsolete operation's own pending lock to release before checking the retained current draft.
- Final `npm run test:e2e`: **56/56 passed in one full run (11.6 minutes)** on the rebuilt default Turbopack build, with no retries/skips. This includes all 52 prior cases plus four new desktop/Android regression cases. The deleted-block race, failed access recheck, genuine revocation, obsolete callback/lock release and stabilized session-failure sequence passed in the integrated run. The deliberate setup-error output in the existing retry tests was expected and followed by successful recovery.

An earlier 56-case attempt was stopped after 21 reported cases (20 passes, one existing Calendar session-fixture timeout). Its simulated identity failure could hide Save before Playwright clicked it during a background post-save read. The fixture now finishes a clean refresh, explicitly triggers verification through focus, then asserts editing pauses and its draft survives retry. No authentication behavior was weakened. The shutdown then interrupted the remaining verification; neither interrupted run is counted as a full pass.

The correction changes only Calendar client handling, browser regressions and related documentation. It requires no new migration or dependency. Coordinator re-review remains pending. Physical Android, production/Ubuntu, provider email and new dependency-audit checks were not performed for this correction.

Final correction handoff: all six task-owned files are staged and `git diff --cached --check` passes. Coordinator re-review remains pending. No commit, push or deployment was performed. Suggested commit: `fix: preserve calendar drafts after block deletion`.

## Coordinator re-review at `da206b5` — 2026-11-08

The deleted-block P2 is resolved with no new actionable findings. Independently passed lint/types, schema validation, migration status, Webpack build, **74/74 backend checks** and **6/6 focused desktop/Android cases** in 1.5 minutes. Checked deleted versus revoked access, failed checks, unrelated-draft preservation, obsolete callbacks and account switching. The review left the working tree unchanged. It did not repeat the implementer's full 56-case suite or verify physical Android/proxy/Ubuntu deployment. The owner subsequently requested task 010's HTTPS preview/account setup.
