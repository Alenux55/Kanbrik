# 005: Workspace-owned projects and tasks

Status: Implemented and independently reviewed at `0929f9a`; cross-tab account/draft isolation needs corrective task 006. See completion evidence and review addendum for exact results.

Suggested model: GPT-6.1 Sol, High effort. Reuse the implementation chat from tasks 001–004, rereading the current instructions, coordinator handoff, and this task. Model choice is not configured by this file.

## Outcome

Users can create and edit projects and actionable tasks in their personal or shared workspaces. A project has planning text and related tasks; a task can be standalone or have one level of subtasks. The five fixed statuses work through explicit controls. Shared edits detect stale revisions instead of silently overwriting newer work. This establishes canonical records for the future board and calendar.

## Baseline and inputs

- Read `AGENTS.md`, `docs/handoff.md`, and relevant product/architecture/stack sections. Use the task 003 permission contract and task 004 identity/recovery protections.
- Reviewed baseline: `ca6fbc7`. The coordinator independently passed lint/types, schema validation, Webpack production build, all 43 unit/database/SMTP checks, and all 20 desktop/Android-emulation browser cases in one full run. No actionable findings remained in that review; the task 002 retry defect is fixed and covered.
- Default Turbopack builds have historical intermittent results without an established root cause. Use/report the documented Webpack fallback where needed; do not claim a fix or undertake unrelated tooling upgrades.
- Continue using the existing stack and guarded development/test PostgreSQL databases. Preserve the owner's independent Ubuntu environment file and SMTP configuration. No production changes, real-provider emails, or system-service installation are in scope.

## Initial behavior and scope choices

These are recommended defaults for this implementation slice, not additional user-confirmed requirements.

- Projects: required trimmed title (1–200 characters), optional plain-text planning description (up to 20,000 characters), workspace ownership, timestamps, and revision. No separate project workflow/status initially.
- Tasks: required trimmed title (1–200 characters), optional plain-text description (up to 20,000 characters), workspace ownership, optional project, optional parent task, fixed status, timestamps, and revision. Default status is `todo`; the create form can choose another supported status.
- Centralize stable status IDs and their display names: `backlog` / Backlog, `todo` / To do, `in_progress` / In progress, `blocked` / Blocked, `done` / Done. Only `done` means complete. Neither scheduling nor archive state is a task status.
- Support standalone tasks so ordinary work does not require a project. This is task persistence, not a new checklist/inbox system.
- Support one parent/child level initially. Parent and child must have the same workspace and project, including both being standalone. A child cannot have children or itself as parent.
- Parent/child statuses are independent: completing a parent does not silently complete children, and completing every child does not automatically complete the parent. Keep child statuses visible.
- Workspace, project assignment, and parent assignment are fixed after task creation in this slice. Derive a new subtask's context from its authorized parent; reject contradictory client IDs. Moving/reparenting tasks and moving projects across workspaces are deferred.
- This slice creates, reads, and updates records. Delete/archive/restore are deferred, with no misleading controls. Future scheduling references must not motivate hard deletion now.

## Access and ownership contract

| Context | Read content | Create/edit projects and tasks |
| --- | --- | --- |
| Personal workspace owner | Yes | Yes |
| Shared workspace owner | Yes | Yes |
| Shared workspace editor | Yes | Yes |
| Nonmember or another personal account | No | No |
| Anonymous request | No | No |

- A shared owner and editor have the same content-editing rights in this slice. Only the existing owner-only operations manage membership; do not grant editors membership administration.
- Derive the actor from the verified session. Workspace membership, not record authorship or a client-supplied owner ID, grants access. If creator metadata is recorded, it is audit metadata and must not become an extra sharing rule.
- Scope list/detail/update requests and every linked ID to current authorized workspace access. Use 401 for anonymous API requests and 404 for inaccessible content/workspace IDs without leaking titles or existence.
- Recheck authorization in the mutation transaction after acquiring the workspace lock used by membership changes. A removed editor queued behind removal must not later save content using stale authority. Refactor reusable helpers carefully; do not weaken personal-owner predicates or owner-only membership operations.
- No project-level privacy exceptions inside shared workspaces. Personal workspaces remain one-member and cannot be converted through content APIs.

## Schema and application operations

- Add Project and Task models through an additive checked-in migration. Use stable identifiers and non-null workspace ownership. Preserve existing users, sessions, workspaces, memberships, and applied migrations.
- Use database relationships/constraints for workspace-consistent references where practical, backed by transactional server validation for hierarchy/project rules. Nullable project/parent references must not provide a bypass for inconsistent workspace ownership. Test invalid direct database relations as well as invalid HTTP input.
- Keep one canonical task record. A subtask is a task with a parent relationship, not a separate card copy. Do not add board-owned or calendar-owned task tables.
- Validate allowed statuses and strict input shapes on the server. Reject forged workspace/creator fields on edits, unsupported keys, overlong/blank titles, invalid relationships, and invalid status values.
- Provide small shared application operations and explicit response contracts for project/task list, detail, create, and update. Future views should reuse them. Do not send whole auth records or unnecessary membership/account information in content responses.
- Suggested resource structure: project operations under `/api/workspaces/[workspaceId]/projects` and task operations under `/api/workspaces/[workspaceId]/tasks`, with ID routes for detail/update. Exact routing may follow repository conventions, but document the final contract. An ID in the path is not authorization.
- Use deliberate ordering, such as creation time plus ID, for predictable lists. A workspace-scoped project/task list is enough; global search, manual ordering, and multi-workspace aggregation are deferred.
- Mutation responses confirm a save only after commit. Keep user-specific reads uncached or correctly scoped; never share one account's content through a global cache.

## Concurrent updates and failure behavior

- Add a monotonic integer revision to editable projects/tasks. Updates supply the expected revision; the server atomically compares it and increments on success. An equivalent approach requires a documented reason and equally strong tests.
- Return a clear conflict response (recommended HTTP 409) for an authorized stale edit, with safe current-state/revision information. Check access before returning conflict details.
- For simultaneous updates based on the same revision, exactly one succeeds and the other receives a conflict. Do not silently retry by overwriting the current record or treat an old form's values as authoritative.
- Preserve unsaved input when saving fails or conflicts. Offer explicit actions to load the saved version or retry after reconciliation; discarding a draft must be a user action. No sophisticated automatic merge is required.
- If drafts are kept beyond a component's lifetime, scope them to the authenticated user, workspace, and record, and clear protected draft state on sign-out/account change. This is session recovery, not a promise of offline editing.
- Show pending/confirmed/failed states and prevent duplicate in-flight submissions. A failed response must not look saved. Keep the server-error retry behavior from task 003 working.
- If access has ended, clear the working protected view on the next fetch/action and explain the loss of access. Do not imply that previously downloaded information can be erased remotely.

## Interface

- Replace the Projects placeholder with a functional workspace-scoped planning experience. Select one accessible workspace explicitly and display its name/kind. This is a Projects view scope, not a new global active-workspace or board/calendar filter.
- Support a project list/create form and project detail/edit view with planning text and task/subtask creation and editing.
- Provide a clear section/list for standalone tasks in the selected workspace. Task status is editable without dragging; display parent/child relationships and statuses legibly on narrow screens.
- Switching workspace or navigating away from a dirty form must not silently discard its draft. Either keep that draft scoped to its original record/workspace during the session or ask before discarding. Never carry one workspace's draft into another workspace's save destination.
- Render descriptions as plain text. Do not introduce an HTML editor, arbitrary HTML rendering, or a separate notes engine.
- Preserve Workspaces management, identity/recovery, keyboard focus, touch-sized controls, and other content placeholders. Board/Calendar/Lists/Inbox must not claim to display or save the new records before those views are implemented.
- Prefer existing UI/data tools and straightforward forms; do not install future board/calendar dependencies for this task.

## Suggested sequence

1. Define Project/Task schema, status definitions, safe contracts, and additive migration.
2. Implement authorized application operations, workspace-consistent relationships, and stale-revision handling with database/HTTP tests.
3. Add the explicit-workspace Projects and standalone-task UI, project planning, subtasks, and conflict/failure recovery.
4. Verify the full personal/shared journey on desktop and Android emulation, run relevant regression checks, and update documentation and completion evidence.

One agent owns this task; separate commits for schema/operations and UI are useful. Stop after this scope rather than continuing into a board or scheduler.

## Acceptance criteria

1. Existing development data survives migration, and fresh guarded test databases can apply the complete migration history. No reset of development/production data is required.
2. A personal owner and shared owner/editor can create/read/edit projects and standalone/project tasks. After refresh or a new authorized session, the same canonical records persist.
3. All five statuses save/display correctly. Unsupported status values fail at the server. Parent/child completion remains independent and is clear in the UI.
4. One-level subtasks inherit valid workspace/project context. Self-parenting, deeper nesting, cross-project/cross-workspace references, and attempts to change immutable assignments are rejected without partial writes.
5. Anonymous, nonmember, and another personal account cannot list/read/create/update content through direct requests. Shared editors cannot use content operations to administer membership.
6. Membership removal blocks later content reads and writes, including an update that waited behind the removal lock. A still-valid account session is not sufficient authority.
7. Concurrent same-revision updates yield one successful commit and one conflict. The conflicting form keeps its unsaved input and does not overwrite the newer edit on an automatic retry.
8. Failure/conflict and workspace-switch/navigation behavior preserve or explicitly discard drafts, and clearly indicate actual save state. An inaccessible workspace/record never remains a working edit form.
9. Desktop and Android-emulated project/task/subtask workflows are usable with keyboard/touch and without unintended horizontal overflow. Existing auth, retry, shared-access, and password-recovery coverage continues to pass.
10. Completion notes accurately distinguish the new Projects/task behavior from unimplemented Kanban/calendar/checklist/inbox features. No real-provider mail, production deployment, or unrequested scope is claimed.

## Verification expectations

- Use real guarded PostgreSQL and server/HTTP tests for relationships, membership isolation/revocation, strict inputs, migration behavior, revision conflicts, and transaction rollback. Mock-only permission tests are insufficient.
- Include multiple accounts, two workspaces, projects with children, and standalone tasks to exercise valid/invalid combinations. Clean only owned fixtures; consider new relation cleanup order without weakening guards or globally truncating data.
- Add browser journeys for personal work, shared editing, a deterministic stale edit in two contexts, a failed save, subtasks, and a workspace switch with a dirty form. Keep failure injection limited to isolated fixtures/test servers.
- Run documented lint/type, schema, migration, unit/integration, build, and browser commands as appropriate. Distinguish actual default-build results from fallback results, full-suite passes from focused reruns, and Android emulation from hardware.
- Local email tests must continue to override provider settings with the memory-only loopback SMTP capture. Do not send review/fixture mail through the owner's SMTP service.

## Out of scope

Kanban columns/dragging; calendar/time blocks; multi-workspace aggregation/preferences; due dates/recurrence; assignees/notifications; priorities/tags; attachments/comments; nested subtasks beyond one level; record moves/reparenting; delete/archive/restore; rich text/knowledge management; checklists/inbox persistence; custom statuses; ownership/registration/invitation changes; SMTP/provider changes; offline editing; SilverBullet; deployment/system-service changes.

## Completion handoff

Implemented on 2026-11-05 against reviewed baseline `ca6fbc7`, preserving the coordinator's staged task-preparation documents. No dependencies were added or upgraded; the established pinned stack is reused. No later roadmap phase or remote server operation was implemented.

### Delivered contracts and interface

- Added `Project`, canonical `Task`, and `TaskStatus` through additive migration `202611050002_projects_tasks`; original migration unchanged. Both records have explicit workspace ownership, timestamps, title/description and monotonic revision. Composite foreign keys plus SQL checks/triggers reject cross-workspace references, nullable-project mismatches, deeper/self nesting, invalid values, and context reassignment. Workspace/user cascades support existing lifecycle and fixture cleanup; no content deletion API/UI is exposed.
- `src/lib/task-statuses.ts` centralizes IDs, labels, and Done-only completion. `planning-contracts.ts` defines strict input/response contracts. `src/server/planning.ts` provides reusable operations; `planning-http.ts` maps safe conflict/input responses. Collections `/api/workspaces/[id]/projects` and `/tasks` support GET/POST; detail routes append `/[recordId]` and support GET/PATCH. See `docs/architecture.md` for final payload/status contracts.
- `workspaceContent` uses the existing workspace lock and rechecks the full personal-owner/shared-member predicate after waiting. Owners and editors have equal content rights; membership administration remains owner-only. Every content response is uncached, and mutations retain trusted-Origin/session checks.
- Expected revisions are atomically compared and incremented. An authorized stale save returns HTTP 409 and the safe saved record. Exactly one concurrent same-revision edit commits. A failed SQL write rolls back both text and revision.
- `/projects` now has explicit workspace selection, project list/detail/edit, standalone/project tasks, one-level subtasks, and select controls for statuses. Descriptions are plain text. Project/workspace/parent assignments are fixed at creation; child context is derived from the authorized parent and contradictory IDs fail.
- `PlanningDrafts` in the protected layout is keyed by authenticated user; drafts are keyed by workspace/entity/record or create context. Drafts survive planner navigation and workspace/project switches in memory. Pending-save locks also survive navigation, preventing duplicate in-flight requests; a save completing after unmount refreshes the current view. Dirty drafts are not overwritten by refreshed records. Superseded loads are ignored.
- Conflicts show current text/status/revision beside the kept draft. Users explicitly load the saved version or review/keep their draft before another manual save; no automatic merge/overwrite. Failures remain unsaved. Loss of access on content fetch/action clears the working forms and that workspace's drafts. Sign-out/account change discards protected drafts. Reload/close warns when supported, but there is no durable browser storage or offline editing.
- Workspace selection belongs only to Projects. Shared changes are fetched on opening/selecting the view, completed saves, or Refresh planning; no live push is promised. Board/Calendar/Lists/Inbox remain clearly labeled placeholders.

### Actual verification

- `npm run db:generate`, `npm run db:validate`, and `npm run check` passed with the installed versions. Both default `npm run build` (Turbopack) and `npm run build -- --webpack` passed during this task. The final regression server uses the Webpack build; historical intermittent helper-process failures are not claimed fixed.
- Development migration: ran `node .local/task005-migration-check.mjs` (ignored, temporary verification harness) which invokes the same `prisma migrate deploy` operation as `npm run db:migrate`. It seeded one owned fixture in each of User/Account/Session/Workspace/Membership **before** migration, compared counts and ordered whole-row digests of all six existing tables before/after, then deleted only its fixture. All rows were unchanged; Verification was empty and unchanged. Existing development tables were otherwise empty. Proof is local/ignored at `.local/task005-migration-proof.json`; no data reset or secrets in the report.
- `npm run db:test:migrate` passed against the existing guarded `kanbrik_test` database on portable PostgreSQL 17.11, loopback 55432.
- Fresh-history verification: `node .local/task005-fresh-migration-check.mjs` provisioned a separate temporary portable cluster on loopback 55434 with generated local credentials, applied **both** migrations via the guarded test wrapper to `kanbrik_test_005_fresh`, then ran `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: **no difference detected**. It stopped that cluster afterward; no system service or shared database reset. Harness/proof/data remain ignored under `.local`; they are verification artifacts, not new application commands.
- Final `npm run test`: **53/53 passed** (four files), including 10 new real PostgreSQL/HTTP planning cases and all previous identity/session/workspace/SMTP/safety checks. Coverage includes personal/shared create/read/update rights, new-session persistence, all statuses, independent completion, strict inputs/Origin, foreign/project/parent isolation, direct SQL constraint rejection, task/project same-revision races, explicit SQL rollback, and membership revocation. The queued-save check holds the workspace removal transaction, confirms the editor HTTP update is actually blocked using PostgreSQL lock metadata, commits removal, and observes 404 with unchanged revision. Public owner removal is separately exercised against subsequent content writes.
- Initial focused planning browser run: **4/4 passed**, desktop and Pixel 7 touch emulation. A subsequent full run passed **24/24** in 4.7 minutes against the default build, including navigation-during-save coverage. Final review then fixed the manual-refresh busy state when a completed save supersedes its load and added deterministic overlapping-read/save coverage. Existing recovery tests continue to use loopback memory-only SMTP, never the owner's provider.
- Android-emulated screenshot inspected: forms and parent/child statuses readable, touch controls usable, no horizontal overflow in the tested journey. No physical Android device was used.

Final Webpack browser regression: `npm run test:e2e` had **23 passes and 1 failure** in 4.7 minutes. All four planning cases passed, including the final overlapping refresh/save regression on desktop and Android. The desktop recovery case failed in fixture setup at the initial `/sign-up` navigation with Chromium `net::ERR_NO_BUFFER_SPACE`, before exercising recovery. `npm run test:e2e -- --project desktop --grep "password recovery delivers"` then passed **1/1** (16.2 seconds) without changing application/test code. All 24 distinct cases are verified on the final implementation across these runs; do not claim the latest full run itself passed 24/24. No browser retry policy was added or auth test weakened. Expected injected bootstrap failures also appear in retry-test server output; those recovery cases passed.

### Limitations and next handoff

- Scope defaults were implemented as specified: `todo` default, text/length limits, standalone tasks, one-level children with independent completion, equal owner/editor content editing, fixed assignments, and create/read/update only. These remain bounded defaults, not newly user-confirmed product requirements.
- No production deployment, Ubuntu/Docker runtime check, real-provider send/TLS/inbox test, hardware Android check, backup/restore verification, new dependency audit, or independent second-agent code review was performed. The separate SMTP success remains user-reported. No claim that live collaboration, offline editing, moves, deletion/archive, or remaining planner views are implemented.
- Next proposed assignment: a separately scoped Kanban view over these canonical tasks, including explicit authorized workspace selection and non-drag controls. It has not been started. Review task 005 and this handoff before assigning it.

### Independent review follow-up

Coordinator review of committed `0929f9a` independently passed lint/types, schema validation, Webpack build, **53/53** unit/database/SMTP checks, and **24/24** browser cases in one full run (4.8 minutes). A separate same-cookie-jar two-tab reproduction found that account A's header and unsaved shared-task draft can remain after account B signs in elsewhere and the original tab navigates away/back. The existing passing cases do not cover that identity transition. The earlier completion claim about account-change draft clearing is therefore incomplete; [task 006](006-cross-tab-session-isolation.md) must fix and test it before closure. Other implementation-era test/migration evidence above is preserved as history.

Stage only this assignment's changed files and provide a commit message. Leave committing, pushing, and deployment to the owner unless explicitly instructed otherwise.
