# 002: Accounts and automatic personal-workspace creation

Status: Implemented and verified (2026-11-05), with the build/runtime limitations recorded below.

Suggested model: GPT-6.1 Sol, High effort. Reuse the foundation implementation chat if practical, but reread the current instructions and this task. This recommendation does not configure the model.

## Outcome

A user can create a development/test account, sign in, refresh the application without losing the session, and sign out. Each account receives exactly one persistent private personal workspace. A second account receives its own workspace and cannot read the first account's workspace. Shared-workspace creation and invitations are a separate task.

## Dependencies and inputs

- Read `AGENTS.md`, the task 001 completion handoff, and relevant sections of `docs/product.md`, `docs/architecture.md`, and `docs/stack.md`.
- Reuse the installed Next.js/TypeScript/PostgreSQL/Prisma stack. Add stable compatible Better Auth, its Prisma adapter, Prisma Client/PostgreSQL driver integration, and input validation where needed. Consult the official documentation for the actual installed versions; do not copy APIs from incompatible releases.
- Obtain a working disposable development/test PostgreSQL database before claiming database behavior is verified. Docker was unavailable during task 001 and remains unverified. A separately provisioned local/test PostgreSQL instance is acceptable; no production credentials or production data are part of this task.
- Keep the database, application/session secrets, and test accounts separate from production. Tests that clear data must target an explicitly configured test database and refuse ambiguous or production targets.

## Review follow-ups from task 001

- The independent review passed lint/type checks, schema validation, and all six browser tests. The default `npm run build` failed with a Turbopack CSS/helper-process error, including after a permission-enabled retry. `npm run build -- --webpack` succeeded and its production build passed the browser tests. The cause is unresolved; do not report it as a proven application defect or a resolved environment issue.
- Recheck the documented build workflow during this task. If a fallback is needed, document the exact verified command and preserve the distinction between default and alternate results. Avoid unrelated build-tool rewrites or broad upgrades.
- Replace the stale `AGENTS.md` statement that no setup/test commands exist with guidance to use and maintain the verified commands in README.md. This narrow correction is in scope; preserve the remaining working agreements.
- The unit-test command currently succeeds with zero tests. This task must introduce meaningful database/authentication tests; readiness-only success is no longer sufficient evidence.

## Implementation scope

### Identity and session flow

- Use Better Auth for account/session/password handling. For this development slice, use email/password sign-up and sign-in so the flow can be exercised without an external identity provider or email service. This is an implementation baseline, not a finalized public-registration policy.
- Keep account registration explicitly enabled only for local development/test by default. Deployed/public registration must remain disabled until its policy is settled. Reject disabled registration on the server, not just by hiding a form. Do not accidentally enable registration because a production-mode local test uses a different build mode.
- Provide accessible sign-up/sign-in forms and sign-out, including pending/error states and prevention of duplicate submissions. Never invent authentication success or save real passwords in logs, fixtures, source files, browser storage, or committed configuration.
- Use the library's session and request-origin protections with environment-based secrets and documented trusted application URLs. Do not hand-roll password hashing or session tokens. Avoid exposing raw internal/database errors.
- Protect the planner shell and every new workspace operation on the server. Public authentication screens and required auth handlers remain reachable without a session. Keep secrets and database access in server-only modules.
- After successful authentication, show the actual signed-in state and personal-workspace name. The other product screens remain explicit placeholders. Sign-out ends access to protected requests; a browser back/refresh must not restore a working session or serve another user's cached data.

### Persistent schema and bootstrap

- Add the authentication schema required by the chosen adapter, Prisma Client integration, and checked-in migrations applicable to an empty development database.
- Add the smallest workspace/membership schema consistent with the architecture: explicit workspace kind, personal owner identity, and owner membership. Leave room for shared workspaces without implementing their flows.
- Enforce at the database level that a user can have at most one personal workspace and that a workspace/user membership pair is unique. A mutable display name is not an identity key.
- Implement a server-side bootstrap operation that derives the user from the verified session, creates the personal workspace and owner membership consistently, and returns the existing workspace on repeat calls. Initial account onboarding and interrupted-onboarding recovery must both reach the same result.
- Handle concurrent requests through database constraints and appropriate transaction/retry behavior. Application-only existence checks are insufficient. Do not leave a usable personal workspace without its owner membership if creation is interrupted.
- Do not accept a client-supplied user/owner ID as the authenticated identity. A user must not be able to create a workspace on behalf of another user or read a workspace by guessing its ID.
- Personal workspaces remain one-user private workspaces. Do not introduce endpoints that can add collaborators or change their kind in this task.

### Verification and documentation

- Add repeatable migration/setup instructions, placeholder environment configuration, and a separate test-database workflow. Avoid committing credentials or fixed real accounts.
- Update README.md and architecture/stack notes to describe implemented behavior and remaining limitations accurately.
- Preserve the existing responsive navigation and placeholder scope. Update browser tests to authenticate where necessary rather than removing the shell coverage or disabling authentication in the application under test.

## Boundaries

- No shared-workspace creation, invitation delivery, membership administration, project-specific sharing, workspace merging/transfers, or multi-workspace board/calendar filters.
- No projects/tasks CRUD, task-status UI, calendar/dragging, inbox/list persistence, offline editing, or SilverBullet integration.
- No social login, password recovery, email verification/delivery, billing, or production account-administration UI. Document that these omissions and the registration policy must be considered before production use.
- No production deployment, production migrations, external account changes, or installation of Docker/system services as part of this task. If test database access cannot be established, report that prerequisite and remaining checks rather than substituting mocks and marking the task complete.

## Acceptance criteria

1. A fresh development/test database can apply the checked-in migrations and run the documented authentication flow.
2. A development/test user can sign up, sign in, refresh a protected route, and sign out. Invalid credentials and expired/invalid sessions are handled without exposing protected workspace data.
3. Public/deployed registration is disabled by default and disabled registration attempts are rejected server-side. Local production-mode browser tests can explicitly use the documented test configuration.
4. Successful onboarding creates exactly one personal workspace and one owner membership. Repeat login, repeated bootstrap, concurrent bootstrap, and a recoverable interrupted bootstrap do not create duplicates or inconsistent ownership.
5. Two authenticated users see different personal workspaces. Unauthenticated requests and user B's direct requests for user A's workspace are denied at the server, including a forged owner/user identifier. User-dependent data is not shared through caching.
6. Desktop and Android-sized/touch-emulated flows work with visible errors and pending states, keyboard-accessible forms, and no unintended page-wide overflow.
7. Meaningful database integration and authentication/browser tests pass against the actual test database. Existing relevant checks pass; default-build failures and any verified fallback are reported separately.
8. Configuration and documentation distinguish local/test from production, and distinguish implemented identity/workspace behavior from the remaining product placeholders.

## Verification expectations

- Test database constraints and bootstrap behavior using real PostgreSQL, including simultaneous calls and failure/retry. Verify actual row counts and membership ownership, not just mocked return values.
- Exercise authentication failures, session persistence/sign-out, and direct unauthorized workspace requests through the real server/auth boundary. Do not rely only on hidden UI controls or mocked session IDs.
- Run relevant lint/type checks, schema validation, migrations, integration tests, build checks, and browser tests. Record exact commands and results; do not claim unavailable device/container coverage.
- Keep test fixtures disposable and isolate parallel tests so data cleanup cannot affect development or other test runs.

## Completion handoff

### Delivered

- Better Auth and its Prisma adapter 1.7.18, Prisma Client/pg adapter 7.10.1, pg 8.23.1, Zod 4.6.7, server-only 0.0.1, and pg type definitions 8.23.1. Stable version/peer/engine metadata and official APIs were checked; selected versions are pinned in package.json/lockfile. No future planner libraries were added.
- Public `/sign-in` and `/sign-up` forms, library handler `/api/auth/[...all]`, pending/error states, duplicate-submit guards, and sign-out. Protected planner layout/pages verify real database sessions. Session cookie caching is disabled; sign-in/out force document navigation to discard previous client router state. Library passwords, cookies, origin checks, and rate limits remain enabled.
- Registration is rejected server-side unless explicit local/test mode, opt-in registration flag, and loopback trusted application URL all agree. Production is the default mode and does not inherit registration from NODE_ENV. Browser verification includes a production-mode server with the opt-in flag set that still rejects signup.
- Initial migration `202611050001_accounts_workspaces` contains Better Auth user/session/account/verification tables, explicit workspace kind/personal owner, membership role, unique owner and workspace/user constraints, a personal-kind/owner check, and a trigger restricting personal membership to its owner.
- `personalWorkspace(headers)` derives identity from the verified session and performs workspace/membership upserts under a per-user PostgreSQL advisory lock in one transaction. Repeat/concurrent calls return one workspace ID. Missing workspace or membership after interrupted onboarding is repaired; failed transactions roll back. A mutable name is never an identity key.
- `POST /api/workspaces/personal` accepts only an empty JSON object and trusted Origin; no client identity is accepted. `GET /api/workspaces/[id]` requires current personal owner identity and owner membership. Unauthenticated API calls return 401; another user's ID returns 404. Responses use no-store and planner pages render dynamically. There are no shared workspace or membership-administration endpoints.
- Planner navigation remains responsive with all five content placeholders. The actual personal-workspace name and signed-in email replace the former account/workspace placeholder copy.
- `scripts/portable-postgres.ps1` starts/stops a portable local cluster without a system service; init generates separate development/test roles, databases, credentials, and ignored environment files. `.local`, generated Prisma code, and local secrets are ignored. Source/build tools exclude portable third-party files. Compose/Docker scaffolding now accounts for Prisma generation, database configuration, and disabled registration; container execution is still unverified.
- README, architecture/stack/roadmap notes and the narrow stale setup-command rule in AGENTS.md were updated. Existing task 001 and unrelated working agreements were preserved.

### Verification evidence

Windows, Node 24.19.0, npm 12.0.2, actual portable PostgreSQL 17.11 on loopback port 55432. No production database/server or external account was accessed or changed.

| Command/check | Actual result |
| --- | --- |
| Official EDB Windows archive and `postgres --version` | Portable PostgreSQL 17.11 downloaded/extracted to ignored `.local`; no system service installed |
| `./scripts/portable-postgres.ps1 init` | Passed; initialized cluster, started loopback listener, created isolated roles/databases and ignored generated configuration |
| `./scripts/portable-postgres.ps1 stop` then `start` | Passed; database restarted, and repeated `npm run db:test:migrate` reported no pending migrations |
| `npm ci` | Passed from lockfile, including project postinstall Prisma client generation; npm 12 still reports blocked dependency hooks and the existing development audit findings |
| `npm run db:generate` / initial `npx prisma generate` | Generated Prisma 7 client successfully |
| `npm run db:migrate` | Applied checked-in migration to empty development database |
| `npm run db:test:migrate` | Applied migration to separate empty guarded test database |
| `npm run db:validate` | Schema valid |
| `npm run check` | ESLint and strict TypeScript/Next route checks passed |
| `npm run build` (default) | FAILED: Turbopack CSS/helper process exited before connection, including with required process access. Cause remains unresolved |
| `npm run build -- --webpack` | PASSED; production build used by integration/browser checks |
| `npm run test` | 15 passed: 8 test-target guards and 7 real PostgreSQL/HTTP integration tests |
| `npm run test:e2e` | 12 passed (2.3 minutes): original six authenticated shell checks plus desktop/mobile signup, pending state, refresh, sign-out/back/refresh, invalid-login recovery, repeat sign-in, disabled registration, origin rejection, and keyboard forms |
| `npm run dev -- --webpack --port 3101` | Ready; `/sign-in` HTTP 200 and anonymous `/projects` redirected to `/sign-in`; development server stopped after verification |
| `npm audit --omit=dev` | 0 vulnerabilities; full audit retains the eight moderate development-only linter-chain findings from task 001 |
| Desktop/mobile screenshots | Visually inspected 1440×900 desktop and Pixel 7 393×727 CSS viewport; responsive signed-in shell, readable content, wrapping account label, no page-wide overflow |
| `git diff --check` and ignored-file checks | Passed; `.env`, `.env.test`, database data, and generated client are ignored |

Integration evidence includes six simultaneous bootstrap requests with one resulting workspace/owner membership; repeated and post-login bootstrap identity; interrupted-onboarding and missing-membership recovery; PostgreSQL uniqueness/check/trigger rejection; transaction failure/rollback followed by successful retry; two-account isolation; forged user/owner IDs; anonymous/direct requests; hostile Origin; no-store reads; expired/invalid sessions; and rejection of the old cookie immediately after sign-out. Tests use generated per-run accounts and delete only owned fixture IDs/emails. Test scripts reject non-loopback/non-test targets and do not reset or truncate a database.

Initial linting accidentally included portable third-party sources; `.local` and generated files were then excluded. Initial browser parallelism exhausted the library's shared-loopback auth rate limit; tests now run serially with a deliberate pause, without disabling protections. A test-only back/refresh navigation race was corrected by waiting for the redirect to finish. The final runs above pass.

### Limitations and next task

- The default Turbopack build remains unresolved; use the exact verified Webpack fallback. The development Webpack path is verified; default development behavior after adding identity was not claimed to pass.
- Docker/Compose, Linux/container execution, real Android hardware, Firefox/WebKit, production TLS/proxy configuration, backup/restore and deployment remain unverified. Portable PostgreSQL provides real database evidence rather than mocks. No Docker/system service installation or production deployment occurred.
- Public registration remains disabled. Email verification/delivery, password recovery, social login and production account administration are not implemented. The local/test email/password baseline does not settle public signup/invitation policy.
- Shared-workspace flows, planner CRUD, calendar/dragging, filters, offline editing and save/conflict behavior remain outside this change. Shared kind/editor values reserve schema options only.
- Existing development linter dependency advisories and ESLint support limitations remain as documented in stack.md; no unrelated broad upgrades were made.
- Next bounded task: shared-workspace creation and membership with its own ownership/role/invitation decisions, acceptance criteria, migrations and authorization tests. It was not implemented automatically.
