# Architecture constraints and candidate model

The domain sections below remain a planning contract, not implemented behavior. The selected foundation stack is in stack.md. The target is an always-online Ubuntu server; Docker availability on that server has not been verified.

## Implemented foundation, identity, and sharing (tasks 001–003)

- One Next.js App Router application with TypeScript and React. A protected route-group layout owns navigation; a section route renders five clearly labeled placeholders. `/` redirects to `/projects`; unknown sections return 404 for authenticated users. Server page and layout checks verify the database-backed session, not merely cookie presence.
- The shell uses Tailwind CSS and a repository-owned, simplified shadcn/ui badge and utility convention. Navigation is ordinary links, supports keyboard use, and reflows into a grid on narrow screens without a drag dependency. Fonts are local system fonts.
- Better Auth email/password identity and database-backed sessions are implemented for local/test use. `/sign-in` and `/sign-up` are public; `/api/auth/[...all]` mounts the library handler. Library origin/password/session protections remain enabled; cookie session caching is disabled so revocation/expiry is checked against PostgreSQL. Secrets/database access stay in server-only modules. Generic errors avoid exposing database details. Sign-in/out force a full document navigation to discard prior client router state.
- Registration is server-disabled unless explicit local/test mode, an opt-in flag, and a loopback trusted app URL all agree. No `NODE_ENV` registration fallback exists; production-mode local tests explicitly set test mode. The public-registration policy remains open.
- The first authenticated planner request invokes transactional personal-workspace bootstrap. The signed-in state and actual personal-space name are displayed. Workspaces management implements shared creation and owner/editor access. Global active-workspace selection, board/calendar filters and planner content remain unimplemented; no ownership transfer, role-change or workspace-kind-change endpoints exist.
- Prisma 7 client with its PostgreSQL driver adapter and a checked-in migration implement the four Better Auth tables plus `Workspace` and `Membership`. `personalOwnerId` is unique, workspace/user membership pairs are unique, and SQL constraints require personal kind/owner consistency. A migration trigger allows only the personal owner's `owner` membership. Task 003 reuses the shared kind/editor values without a new migration or changes to the applied migration.
- `personalWorkspace(headers)` derives identity from a verified session, takes a per-user PostgreSQL transaction advisory lock, upserts workspace and owner membership, and commits them together. Unique constraints enforce identity even under concurrency; repeated requests return the same ID. Missing workspace or membership after interrupted onboarding is repaired from verified owner identity. No client user/owner ID is accepted.
- `POST /api/workspaces/personal` requires an authenticated session, exact trusted Origin, and strictly empty JSON object. Personal access always requires both owner identity and owner membership; shared access requires a current membership. The shared branch never drops the personal-owner predicate from personal reads. API responses use `no-store`; protected pages are dynamically rendered and uncached. No user-dependent result enters a shared application cache.
- Local Compose reserves a loopback-only PostgreSQL 17 development database and an optional app profile with registration disabled. The multi-stage Dockerfile uses Next.js standalone output and a non-root runtime. Docker/image availability and container execution remain unverified locally; this is not production configuration. A portable PostgreSQL 17.11 process, separate roles/databases, migrations, and integration tests have instead been verified on Windows.
- Browser checks target a production-mode local build, with authentication enabled and a dedicated test database. Unit guards reject unsafe test database targets; integration tests exercise the real HTTP auth boundary, database constraints, transaction rollback/recovery, concurrency, isolation, and revocation. Tests create unique users and delete only their own fixtures. Real Android/Linux/container behavior remains unverified.

### Shared-workspace contract (task 003)

- `GET /api/workspaces` lists only the caller's accessible personal/shared workspaces as `{id, name, kind, role}`. It also recovers initial personal onboarding. `POST` accepts strictly `{name}` (trimmed, 1–100 characters), creates shared kind with no personal owner ID, and creates the verified actor's sole owner membership atomically through a nested write.
- `GET /api/workspaces/[id]` returns the same safe summary plus minimal members `{id, name, email, role, isYou}`. It never returns whole user/session/account records. Anonymous API requests receive 401; inaccessible IDs receive 404 with no name/roster/owner details. An insufficient role in an accessible workspace receives 403.
- `POST /api/workspaces/[id]/members` accepts strictly `{email}`; trim/lowercase follows Better Auth's stored email convention. Only an owner can grant editor access to an existing account. Repeated/concurrent grants preserve one membership. Adding the owner as editor is rejected without modifying its role. This immediately grants access; it is not invitation delivery or identity verification.
- `DELETE /api/workspaces/[id]/members/[membershipId]` requires an owner and a target editor membership scoped to that same workspace. `POST /api/workspaces/[id]/leave` permits only the verified editor's own membership to be removed. Both accept strictly empty JSON bodies. Personal targets, owner changes, forged actor/role fields, and cross-workspace membership IDs are rejected. There are no endpoints for multiple owners, owner leave/removal, demotion, conversion, or deletion.
- Membership mutations check access, lock the workspace row for the transaction, and then recheck the caller's current membership/role before writing. The same lock serializes editor grants/removals/leave, while database uniqueness enforces pair identity. Revocation denies later reads/writes in that workspace without invalidating the account session or its personal/other-workspace access. Already downloaded information cannot be retracted.
- All new writes require verified sessions, validated input, and exact trusted Origin. `workspaceRequest` returns deliberate status/safe error shapes; unknown server/database errors are generic. The client shows pending/confirmed/failed states, retains unsaved form input after failure, and refetches access after successful changes. A missing membership on refresh/action clears the working roster; stale UI grants no server authority.
- `/workspaces` and `/workspaces/[id]` are protected management pages, reachable from navigation. They show kind/role and an explicit management target. The sidebar names only the personal space, not a global active selection. Content views remain placeholders.
- The root error boundary uses Next.js 16.4.5's stable `retry()` prop (available since 16.3), verified in its bundled docs, types, and implementation: refresh then reset. It retries only on user action, with a pending button and another retry if failure continues. Browser regressions inject a membership-write failure scoped to one disposable fixture inside guarded PostgreSQL, without an application failure endpoint or authentication bypass.
- Single owner plus editors, and immediate exact-email grants, are bounded development defaults used by this task. Public signup/invitation policy, verified identities, and ownership administration remain open product decisions.

### Password confirmation and recovery (task 004)

- `SMTP_FROM` accepts a plain email address or `Display Name <email>` (including a quoted display name). It is validated as one mailbox and passed to Nodemailer as a structured name/address object for safe header formatting. Invalid addresses, multiple mailboxes and embedded control characters are rejected.

- Explicitly requested follow-up to the identity slice: sign-up confirms the password locally before making an auth request; the extra confirmation is not a new stored credential or API authentication mechanism. Sign-in links to public `/forgot-password`; `/reset-password` accepts an emailed token and confirms the new password. Pending/error states retain recoverable input, and successful reset requires a fresh sign-in.
- Better Auth 1.7.18 owns reset token generation, one-hour expiry, atomic single use, password hashing, and session revocation. Its Prisma adapter now enables transactions explicitly so token consumption, credential update and database session revocation commit together. Reset preserves canonical users, workspaces and memberships. The existing Verification table supports this without a migration.
- Nodemailer sends plain-text recovery links via server-only SMTP configuration. Email requests are disabled until `PASSWORD_RESET_ENABLED=true` and required host/port/user/password/sender fields validate. Normal SMTP requires STARTTLS or implicit TLS with certificate validation; a plaintext exception is restricted to explicitly enabled loopback local/test mail capture. No mail credentials or URLs/tokens are logged, returned as diagnostic API data, or added to client bundles.
- The application fixes reset destinations to its configured trusted app URL, and requires the exact trusted Origin for reset POSTs, in addition to the library's checks. Known/unknown addresses receive the same generic normal request response; unexpected delivery/database errors remain generic and retryable. SMTP acceptance is not proof of inbox placement. Account email verification/public-signup policy remains separate and deferred.
- Email links place the library-generated token in the reset page's URL fragment, not a server-visible URL path/query. The client reads it after hydration, removes the fragment from history, and submits it only in the reset POST body. Reset pages set no-referrer policy; there is no browser storage queue or token persistence. Users can reopen the email link after an interrupted reload.
- Automated checks use actual PostgreSQL, real HTTP boundaries, and a test-only loopback SMTP sink. Inbox contents stay in memory behind a per-run test secret; there is no application mail-inspection/failure endpoint. Fixtures contain generated accounts only. Real provider delivery, spam filtering and production email/TLS setup remain unverified until configured by the owner.

## Candidate entities

| Entity | Responsibility |
| --- | --- |
| User | Identity and display time-zone preference |
| Workspace | Personal/shared ownership boundary with a name and visual identity |
| Workspace membership | User/workspace relationship and owner/editor role |
| User view preference | Selected workspace IDs; never grants membership |
| Project | Workspace-owned planning context and description |
| Task | Canonical work with workspace, optional project/parent task, and status |
| Status definition | Central fixed definitions with stable IDs; no customization initially |
| List/checklist | Workspace-owned simpler task/item organization; exact item semantics remain open |
| Time block | Workspace-owned start/end/time-zone context and optional project/task reference |
| Inbox item/note | Workspace-owned capture or reference content |

Personal work uses a one-member private workspace, not a separate task model. There are no project-specific sharing overrides initially. Initial personal-workspace creation must be idempotent.

## Ownership and authorization

- Every domain record has a workspace ID. Check membership on the server for all reads/writes, lists/searches, nested content, relationship changes, and membership management.
- Relations/constraints reject inconsistent ownership: tasks and their projects/parents share a workspace; assigned blocks reference work in their own workspace.
- Requested workspace filters are intersected with authorized scope or rejected if invalid. Client selection alone never grants access.
- Define role capabilities centrally. Proposed owners manage membership/settings; editors manage work. Prevent removal/demotion of the last owner. Personal workspaces cannot implicitly acquire collaborators.
- Use an established authentication/session solution. Identifying a user does not replace workspace authorization.
- Private scheduling of shared work must not duplicate tasks or relax ownership constraints. Design an explicit cross-workspace visibility/reference contract if required.

## Board and status invariants

- Centralize backlog, todo, in_progress, blocked, and done as stable IDs, with labels and completion meaning defined once. Only done means complete.
- All workspaces use the same five statuses initially. The combined board groups directly by status without workflow mapping.
- Card moves change status and preserve workspace/project identity. Reordering never silently transfers ownership.
- Project, board, list, and calendar share canonical tasks and application operations.
- Central definitions reduce future customization cost. Workspace-specific statuses would still require deliberate schema/API evolution and data migration; do not build the editing system now.

## Scheduling and integrity

- Initially propose empty blocks or one assignment to existing work in the same workspace. Multiple blocks may reference the same work.
- Moving/resizing changes the schedule, not task status or due date. Removing blocks never deletes work.
- Require end after start. Document the storage/time-zone convention before implementing scheduling, including daylight-saving transitions.
- Prevent parent-task cycles and define parent completion rules before implementing nesting.
- Define archive/deletion behavior before destructive actions; do not silently remove related work.
- Workspace selection is a per-user display preference. Clearing it yields an explicit empty state; creation needs an unambiguous destination workspace.

## Persistence and concurrent updates

- Use persistent server-backed storage shared by authorized users/devices.
- Document fetch/refresh behavior. Live push updates are optional initially.
- Use explicit revision checks or another documented concurrency mechanism for user-edited shared content. Avoid silent last-writer-wins overwrites.
- Confirm saves only after server success. Preserve recoverable input in the current session after failed saves and allow retry; this is not durable offline editing.
- Separate development/test databases from production. Before real production use, document migrations, persistent volumes, backups, and verify a restore.

## SilverBullet boundary

In the proposed standalone design, Kanbrik owns workspace permissions, tasks, status, and schedules. SilverBullet may hold linked reference notes. Two-way synchronization and embedded planner UI are outside the initial proposal.
