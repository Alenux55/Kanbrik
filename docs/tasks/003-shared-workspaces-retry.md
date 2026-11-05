# 003: Shared workspaces and retry recovery

Status: Implemented and verified (2026-11-05), with runtime and development-policy limitations below.

Suggested model: GPT-6.1 Sol, High effort. Reuse the implementation chat from tasks 001–002, rereading current repository guidance. Model selection remains a user setting.

## Why this change comes next

Task 002 established identity and private personal workspaces. The next dependency for shared projects is a tested sharing boundary: users must be able to create a shared workspace, grant access, and revoke it before planner content is added. Fix the task 002 recovery defect first, then implement this small shared-workspace management flow. Projects/tasks come after this task; board/calendar filtering comes with those views.

## Inputs and current evidence

- Read `AGENTS.md`, the task 002 completion handoff, and relevant product, architecture, and stack documentation.
- Current reviewed baseline: commit `c533335`. Independent review passed lint/TypeScript checks, Prisma validation, 15 unit/database/HTTP tests, and 12 desktop/Android-emulation browser tests using the Webpack production build.
- The default Turbopack build remains unresolved. The verified fallback is `npm run build -- --webpack`; distinguish default and alternate results in the handoff. Do not turn this change into a build-tool migration or broad dependency upgrade.
- Use the existing guarded, disposable PostgreSQL test setup. Preserve real session/origin checks and isolated fixtures. No production database/server or external accounts are part of this assignment.

## Part A: Fix recovery after a transient server error

### Observed defect

`src/app/error.tsx` binds “Try again” to `reset()`. After a failed server-side workspace bootstrap, this only resets the error boundary; it does not fetch a fresh server response. Review reproduced an error that remained after clicking, with zero new requests, while reloading the same page successfully recovered.

### Required behavior

- Make “Try again” rerun the failed server request. Use the installed framework's supported retry facility, or explicitly refresh/refetch before resetting the boundary. Verify the actual installed API rather than assuming `reset()` refetches.
- Recover in the same signed-in session without making the user manually reload or sign in again. Preserve the destination and existing personal-workspace identity.
- If the failure continues, retain a clear error and another usable retry action. Avoid an automatic retry loop and keep the control keyboard/touch accessible.
- Add a browser regression test: cause a temporary failure for a disposable user's real workspace setup, release the failure, click “Try again,” and assert a new server request and successful protected-page content. Assert one personal workspace/owner membership remains. Do not pass the test by calling page reload/navigation in test code instead of exercising the button.
- Isolate failure injection to the test server or that fixture's database operations. Do not stop a shared development database, disable authentication, alter global permissions, or add a production-accessible failure endpoint.

## Part B: Small shared-workspace management flow

### Recommended implementation defaults

These are bounded recommendations for this development slice, not user-confirmed production invitation/administration policy.

- A signed-in user creates a shared workspace with a validated, trimmed, nonempty name and becomes its owner atomically.
- Start with one owner and any number of editors. Ownership transfer, additional owners, role changes, and viewer roles are deferred. Reject removal/demotion of the owner; do not leave an ownerless workspace.
- Owners grant editor access to an already registered account by exact email. Use the existing account normalization/validation conventions. There is no public directory, email delivery, pending invitation, invite token, or automatic account creation.
- Say “Add existing account” rather than claiming an invitation was sent. Explain that access is granted immediately. Existing development account emails are unverified; this does not establish identity verification or production invitation safety.
- An owner can remove an editor; an editor can leave. These operations remove membership, not the account, personal workspace, or shared workspace itself.
- Personal workspaces remain private and one-member. They cannot be converted, shared, or passed through shared-membership operations.

### Permission contract

Enforce this on the server for direct requests as well as through UI controls. Identity always comes from the verified session.

| Operation | Shared owner | Shared editor | Signed-in nonmember | Anonymous |
| --- | --- | --- | --- | --- |
| List own accessible workspaces | Yes | Yes | Own memberships only | No |
| Read a shared workspace and minimal member roster | Yes | Yes | No | No |
| Create a shared workspace | Yes, as a signed-in user | Yes, as a signed-in user | Yes, for themselves | No |
| Add an existing account as editor | Yes | No | No | No |
| Remove another editor | Yes | No | No | No |
| Leave an editor membership | Not applicable | Own membership only | No | No |
| Remove/demote the owner or change ownership | No | No | No | No |
| Change a personal workspace's membership/kind | No | No | No | No |

Return 401 for unauthenticated API requests. Use 404 for inaccessible workspace IDs, and a consistent denial for insufficient role within an accessible workspace. Do not expose another workspace's name, owner, roster, or existence through error details. Roster responses contain only what the management UI needs, never sessions, credentials, or whole authentication records.

### Data and application operations

- Reuse `Workspace`, `Membership`, existing kinds/roles, and the authentication stack. Extend the application workspace-access helpers to distinguish personal-owner access from shared membership; do not merely drop the personal-owner predicate everywhere.
- Shared creation writes kind `shared`, no personal owner ID, and the creator's owner membership in one transaction. Personal bootstrap must still find/recover only the user's personal workspace.
- Every supplied workspace/membership ID must be scoped to the authorized workspace. Reject a membership ID belonging to another workspace, forged actor/owner IDs, arbitrary role values, and attempts to target personal workspaces with shared mutations.
- Preserve database uniqueness and personal-membership constraints. Adding the same editor repeatedly or concurrently yields one membership and must never change the owner's role. Keep invariants in server operations/constraints, not just in forms.
- Membership management is atomic and uses current authorization. Once removal/leave commits, later reads and writes by that account must be denied even though its account session is still valid. A previously rendered page is not proof of continuing access.
- Accessible-workspace lists include the personal workspace plus current shared memberships only, with a clear kind and the user's role. Use deliberate safe response shapes and no shared cache of user-specific data.
- Prefer additive migrations if needed. Do not rewrite the applied task 002 migration or reset existing development data. If no schema change is required, document that rather than introducing one artificially.
- Validate inputs and trusted request origins for mutations. Show pending, saved, failed, and retry states honestly; preserve recoverable form input after failure.

### Interface

- Add a protected Workspaces management screen reachable from the planner navigation. Show actual personal/shared memberships, a create form, and access to shared-workspace details/member management.
- Display workspace name, kind, and role. Make personal privacy and the current management target unambiguous; do not make the shell imply that a shared-management page has changed a global active workspace.
- Editors see permitted actions only, including leave; owners see editor management. Server checks remain authoritative.
- Removed users must not retain a working workspace view after the next fetch/action. Refresh the caller's membership/list state after successful changes and show a clear inaccessible state when appropriate.
- Preserve the five existing planner placeholders, account flows, responsive navigation, keyboard focus, and Android-sized touch usability.
- This screen manages memberships. Do not add a dummy board/calendar filter, fake projects, or a global active-workspace setting without content behavior behind it.

## Suggested implementation sequence

1. Fix the recovery button and add its real browser regression test.
2. Define shared-workspace operations, role checks, and safe response contracts; add database/HTTP tests before relying on UI.
3. Add the management screen, existing-account editor addition/removal, and leave flow.
4. Verify desktop/Android flows, run the relevant existing checks, and update documentation/completion evidence.

One implementation agent owns the change. Small separate commits for the recovery fix and shared flow are useful; parallel agents are unnecessary for this contract change.

## Acceptance criteria

1. After a recoverable workspace-setup failure, the real “Try again” button sends a fresh request and restores the protected page without manual reload, duplicate workspaces, or loss of session.
2. A signed-in user can create a persistent shared workspace and receives its sole owner membership atomically. The personal workspace remains intact and private.
3. The owner can add an existing account as editor. That account sees the workspace on refresh; a third nonmember cannot list/read it or inspect its roster.
4. Duplicate/concurrent editor additions produce one membership. Attempts to add the owner as editor cannot demote the owner.
5. Editors cannot add/remove other members or change ownership. Nonmembers cannot grant themselves access. Forged actor/role IDs and cross-workspace membership IDs are rejected directly by the server.
6. Removing an editor or leaving revokes later workspace reads/writes without ending the account's valid session or harming its personal workspace. Owner removal/leave is rejected; the workspace is never ownerless.
7. Personal workspaces cannot be shared/converted through any new endpoint, and personal bootstrap/session-revocation tests continue to pass.
8. The management journey works on desktop and Android emulation with accessible controls, visible save errors, and no unintended horizontal overflow. No email/invitation is falsely claimed.
9. Database/HTTP and browser tests cover the new contracts against real guarded PostgreSQL. Existing relevant checks pass; actual test counts, build outcomes, and runtime limitations are recorded honestly.
10. README and architecture notes distinguish implemented sharing from the still-unimplemented projects/tasks, board/calendar filtering, and production account policy.

## Verification expectations

- Keep existing auth, test-target guards, concurrent personal-bootstrap, sign-out, and shell coverage. Do not weaken origin/rate/session protections to make tests pass.
- Use at least three generated accounts and two shared workspaces to exercise owner/editor/nonmember and cross-workspace boundaries, plus each account's personal workspace.
- Test access loss with a still-valid session and direct requests, not just a hidden navigation item. Test creation rollback, duplicate membership races, and owner-preservation failures.
- Reuse or extend documented migration, lint/type, schema, unit/integration, build, and browser commands as appropriate. Test fresh migrations if a migration is added. Never reset development/production data or clean up beyond owned test fixtures.
- Record real-device, Docker/Linux, and production limitations. A passing local/emulated flow is not deployment verification.

## Out of scope

Projects/tasks CRUD; board/calendar filters or dragging; notes/checklists; custom statuses; recurrence; offline editing; SilverBullet; email/SMTP; invitation tokens; public registration; password recovery; multiple owners/role transfer; workspace deletion or conversion; production deployment/system-service changes; unrelated tooling upgrades.

## Completion handoff

### Delivered

- `src/app/error.tsx` now uses the installed Next.js 16.4.5 stable `retry()` prop, with a pending/disabled control through a React transition. Bundled `error.md`, error-boundary types/source, and the official error API were checked: `retry()` refreshes then resets, whereas `reset()` alone does not refetch. Continuing failure leaves a usable retry button and the same destination/session.
- `tests/e2e/retry.spec.ts` reproduces actual server-side personal bootstrap failure using `tests/database.ts`: a temporary trigger fails membership writes only for the owned fixture's user ID in the guarded test database. The test verifies a fresh GET after the real button, continued-failure retry, then successful Calendar content after releasing the trigger. It verifies the original personal-workspace ID, exactly one workspace/owner membership, and continued signed-in access. No reload/navigation in test code substitutes for pressing retry; no application failure flag/endpoint or shared database shutdown was added.
- `src/server/workspaces.ts` centralizes personal/shared access and shared mutations. `src/server/workspace-http.ts` supplies strict Zod input validation, exact trusted Origin/session guards, safe response/error handling, and no-store responses. `src/lib/workspace-contracts.ts` defines deliberately small summary/roster contracts.
- Added list/create `/api/workspaces`, existing-account editor grant `/api/workspaces/[id]/members`, scoped editor removal `/api/workspaces/[id]/members/[membershipId]`, and own-editor leave `/api/workspaces/[id]/leave`. Extended workspace reads for shared membership while retaining the personal-owner predicate for personal workspaces. Anonymous APIs return 401, inaccessible IDs 404, and insufficient role/owner-preservation/personal-target attempts 403. Bodies reject forged actor/owner/role fields.
- Shared creation commits its sole owner membership atomically. Membership mutations first check access, lock the workspace row, and recheck current membership/role before writing. Concurrent repeated grants retain one editor membership; no operation can add another owner, change roles, remove/leave the owner, or share/convert a personal workspace. Revocation affects subsequent requests without ending the account session or affecting personal/other workspace data.
- Protected `/workspaces` and `/workspaces/[id]` pages, navigation entry, create and member-management components. Names are trimmed/validated (1–100 characters). Owners use exact normalized existing emails for immediate editor access; editors can leave. Pending/confirmed/failed states are visible, failed creation input is retained, and membership actions refetch access. A revoked user's next fetch clears the working roster. Personal privacy, role/kind, management target, and lack of a global active-workspace selection are explicit. Existing five content placeholders and account flows remain intact.
- Used the specified bounded development defaults: one owner plus editors and immediate access for an existing unverified-email account. UI says “Add existing account,” explains immediate access/no invitation delivery, and does not assert identity verification. These defaults do not settle public registration/invitation or production administration policy.
- No dependency/schema changes or migration were needed. The task 002 applied migration, personal-membership constraints and unique keys were preserved; no development database reset occurred. Test cleanup explicitly removes only owned shared workspace IDs and generated accounts. The test command wrapper now forwards focused-run arguments.
- Updated README, architecture, stack, and roadmap documentation. No projects/tasks, filters, scheduling, invitations, offline behavior or production changes were implemented.

### Actual verification

Windows, Node 24.19.0, npm 12.0.2, real portable PostgreSQL 17.11 with the existing guarded development/test separation. The existing database was already running; `pg_isready -h 127.0.0.1 -p 55432` confirmed it accepts connections. An unnecessary duplicate start attempt failed; no service installation, database shutdown or production access was performed.

| Command/check | Result |
| --- | --- |
| `npm run test:e2e -- --grep "retry requests"` | 2 passed, desktop and Android emulation; fresh retry requests and preserved personal identity/membership verified |
| `npm run test:e2e -- --grep "owner grants"` | 2 passed; three-account creation, failed-save input retention, grant/remove/leave and loss-of-access journey |
| `npm run db:validate` | Prisma schema valid |
| `npm run db:test:migrate` | No pending migrations; no new migration/schema change |
| `npm run check` | ESLint and strict TypeScript/Next route checks passed |
| `npm run build` | Default Turbopack build PASSED in this task's latest run; earlier failures remain unexplained, not declared fixed |
| `npm run build -- --webpack` | PASSED; Webpack production build used for final HTTP and browser checks |
| `npm run test` | 21 passed: 8 test-target guards, original 7 personal/auth HTTP/database tests, and 6 shared-workspace HTTP/database tests |
| `npm run test:e2e` | All 16 passed in 3.1 minutes: original 12 plus two recovery and two shared-management checks |
| Screenshot inspection | Desktop 1440×900 and Pixel 7 393×727 CSS viewport; responsive management controls, wrapping long names/emails, no unintended page-wide overflow |
| `git diff --check` and ignore checks | Passed; local/test secrets, cluster files, and generated Prisma code remain ignored |

Shared integration tests use three generated accounts, two shared workspaces, and all three personal workspaces. Evidence includes atomic sole-owner creation, actual creation rollback on owner-membership failure, six simultaneous duplicate editor grants, normalized exact-email lookup, safe roster shape, nonmember list/read denial, forged actor/role input rejection, cross-workspace membership-ID rejection, editor administration denial, owner removal/leave/demotion protection, personal-workspace mutation rejection, and read/write revocation after remove/leave while the account's personal and other shared workspace access still work. Owner membership and all five workspace records remain intact where expected. No fixture cleanup extends beyond owned IDs/emails.

The first shared browser run found a test-locator ambiguity with Next's route announcer; the assertion was scoped to the management main content and then passed. Expected server errors during recovery tests are fixture-induced and generic. Authentication/origin/rate protections were not disabled; tests retain serial execution with a pause for the loopback auth rate limit.

### Limitations and next proposed task

- Both builds passed in the latest run, but the historical intermittent Turbopack helper-process failure has no demonstrated root cause or fix. No broad tooling upgrade or bundler migration was made. Webpack remains a verified alternate.
- Android evidence is Chromium Pixel 7 viewport/touch emulation, not a real device. Docker/Compose, Linux/container runtime, Firefox/WebKit, production proxy/TLS, backup/restore and deployment remain unverified. No external accounts or production servers/databases were changed.
- Account emails are unverified and grants take effect immediately. Public registration remains disabled by default; invitation delivery, verified identities, ownership transfer/additional owners, role changes, account administration and workspace deletion/conversion remain deferred. The existing development-only linter dependency limitations remain unchanged; no audit-clean claim is inferred from unchanged dependencies.
- Membership lists refresh on explicit fetch/action or navigation refresh; live push/presence is not implemented. Information already downloaded cannot be retracted, but stale views cannot authorize later requests.
- Next proposed bounded task: workspace-owned projects and tasks with the five fixed statuses, before combined board/calendar views. Define its task/acceptance criteria separately; it was not started.
