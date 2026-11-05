# Architecture constraints and candidate model

The domain sections below remain a planning contract, not implemented behavior. The selected foundation stack is in stack.md. The target is an always-online Ubuntu server; Docker availability on that server has not been verified.

## Implemented foundation and identity (tasks 001–002)

- One Next.js App Router application with TypeScript and React. A protected route-group layout owns navigation; a section route renders five clearly labeled placeholders. `/` redirects to `/projects`; unknown sections return 404 for authenticated users. Server page and layout checks verify the database-backed session, not merely cookie presence.
- The shell uses Tailwind CSS and a repository-owned, simplified shadcn/ui badge and utility convention. Navigation is ordinary links, supports keyboard use, and reflows into a grid on narrow screens without a drag dependency. Fonts are local system fonts.
- Better Auth email/password identity and database-backed sessions are implemented for local/test use. `/sign-in` and `/sign-up` are public; `/api/auth/[...all]` mounts the library handler. Library origin/password/session protections remain enabled; cookie session caching is disabled so revocation/expiry is checked against PostgreSQL. Secrets/database access stay in server-only modules. Generic errors avoid exposing database details. Sign-in/out force a full document navigation to discard prior client router state.
- Registration is server-disabled unless explicit local/test mode, an opt-in flag, and a loopback trusted app URL all agree. No `NODE_ENV` registration fallback exists; production-mode local tests explicitly set test mode. The public-registration policy remains open.
- The first authenticated planner request invokes transactional personal-workspace bootstrap. The signed-in state and actual workspace name are displayed. Workspace selection/sharing and planner content remain unimplemented; no role administration, workspace-kind changes, or membership-write endpoints exist.
- Prisma 7 client with its PostgreSQL driver adapter and a checked-in migration implement the four Better Auth tables plus `Workspace` and `Membership`. `personalOwnerId` is unique, workspace/user membership pairs are unique, and SQL constraints require personal kind/owner consistency. A migration trigger allows only the personal owner's `owner` membership. Shared kind/editor values reserve a schema path but implement no shared flow.
- `personalWorkspace(headers)` derives identity from a verified session, takes a per-user PostgreSQL transaction advisory lock, upserts workspace and owner membership, and commits them together. Unique constraints enforce identity even under concurrency; repeated requests return the same ID. Missing workspace or membership after interrupted onboarding is repaired from verified owner identity. No client user/owner ID is accepted.
- `POST /api/workspaces/personal` requires an authenticated session, exact trusted Origin, and strictly empty JSON object. `GET /api/workspaces/[id]` checks current user, owner identity, personal kind, and membership server-side; other users receive 404, unauthenticated users 401. API responses use `no-store`; protected pages are dynamically rendered and uncached. No user-dependent result enters a shared application cache.
- Local Compose reserves a loopback-only PostgreSQL 17 development database and an optional app profile with registration disabled. The multi-stage Dockerfile uses Next.js standalone output and a non-root runtime. Docker/image availability and container execution remain unverified locally; this is not production configuration. A portable PostgreSQL 17.11 process, separate roles/databases, migrations, and integration tests have instead been verified on Windows.
- Browser checks target a production-mode local build, with authentication enabled and a dedicated test database. Unit guards reject unsafe test database targets; integration tests exercise the real HTTP auth boundary, database constraints, transaction rollback/recovery, concurrency, isolation, and revocation. Tests create unique users and delete only their own fixtures. Real Android/Linux/container behavior remains unverified.

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
