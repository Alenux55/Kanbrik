# Coordinator handoff — 2026-11-05

## Current state

Tasks 001–005 are implemented. The app has Better Auth accounts/sessions, private personal workspaces, shared owner/editor management, server-error retry, password confirmation, SMTP recovery, named senders, safe email diagnostics, and workspace-owned project/task planning. Projects supports standalone/project tasks, one-level subtasks, five fixed statuses, revision conflicts, and in-session drafts. Board/calendar/checklist/inbox persistence remains unimplemented. No production deployment was performed.

Read `AGENTS.md`, `docs/product.md`, `docs/architecture.md`, `docs/stack.md`, and the task completion records before assigning dependent work. Task records contain the detailed verification evidence and contracts; this file summarizes the transfer to the coordinating agent.

The current implementation handoff is [005: workspace-owned projects and tasks](tasks/005-projects-tasks.md), implemented and verified with the browser-run limitation below. Review its schema, API, permission/relationship and conflict/draft contracts before assigning a separately bounded Kanban task; board/calendar implementation remains separate.

## Latest operational resolution

The owner reports that recovery is now working after correcting **the Ubuntu server's** `~/github/Kanbrik/.env`. They had been editing the local Windows checkout's `.env`, which is independent and ignored by Git. The server diagnostic correctly showed that its saved file contained only the original database/auth settings and no SMTP block. Password punctuation was not the cause. No further application fix is indicated by that incident.

The owner hosts Mailcow and configured it themselves. Do not copy credentials into documentation, requests, fixtures, logs or commits. Real-provider success is **user-reported**, not an independently observed SMTP/inbox/TLS test by this agent.

The Ubuntu app is manually run on loopback port **3005**, accessed through an SSH tunnel. Port 3000 was already occupied by another Docker service. `BETTER_AUTH_URL` must match the browser/tunnel origin, currently `http://127.0.0.1:3005`. The README documents full code-update restart commands, environment-only restart, tunnel reconnection, database setup and `npm run email:check`. Restart after editing the server environment file; Git pulls do not synchronize ignored `.env` files.

## Verification carried forward

- Latest full unit/integration/database/SMTP/safety suite: **53 passed**, including 10 new planning checks plus all 43 prior protections. Content checks cover direct SQL relationship rejection, personal/shared isolation, atomic revision conflicts/rollback, and an HTTP editor save confirmed blocked behind removal before returning 404 after revocation.
- Task 005 lint/strict TypeScript, schema/client generation, development/test migrations, default Turbopack and Webpack builds passed. The final regression server uses the Webpack build. Historical default-build failures remain unexplained; no root-cause fix is claimed. A seeded pre-migration development fixture retained identical whole-row digests in existing tables. A separate fresh guarded database applied both migrations with no Prisma schema drift, then its temporary portable cluster was stopped. See task 005 for exact evidence and artifact limitations.
- Task 005 browser regression: initial focused **4/4** and a later full **24/24** passed. After the final refresh/save overlap fix and deterministic regression, the final Webpack full run had **23 passes and 1 Chromium `ERR_NO_BUFFER_SPACE` failure** in initial sign-up fixture navigation for desktop recovery. Its focused desktop rerun passed **1/1** without code changes. All 24 distinct cases are verified on the final implementation across those latter runs; do not claim the latest full run itself passed 24/24. All four new planning cases passed desktop/Android emulation, including concurrent save/refresh, draft navigation, shared conflict review, and revoked-access clearing. Android planning screenshot inspected; no physical device used.
- Original task 004 browser verification: initial full suite had **18 passes and 2 new recovery-test failures** caused by typing before navigation completed; a focused rerun then passed both recovery journeys. The later independent coordinator review at `ca6fbc7` passed **all 20 cases in one full run**. Do not conflate the earlier partial/focused evidence with this newer full-suite result.
- Task 003 had a full **16/16** desktop/Android-emulation pass. Both default Turbopack and Webpack builds passed in its latest run; earlier default-build helper-process failures remain unexplained. Task 004 used Webpack and did not recheck the default build.
- Last production-dependency audit during recovery work reported **0 vulnerabilities**; eight moderate development-only linter-chain findings/support limitations remain documented in `docs/stack.md`. No new audit was run for the final documentation handoff.
- Real PostgreSQL 17.11 was run portably on Windows with guarded separate local/test databases. Automated SMTP sinks were loopback-only, memory-only and never relayed externally. No production server changes, external account configuration or real-provider sends were performed by the agent.

## Independent coordinator review

Reviewed application/history through `ca6fbc7` on 2026-11-05 with no new actionable findings. Independently verified `npm run check`, `npm run db:validate`, `npm run build -- --webpack`, **43/43** unit/database/SMTP checks, and **20/20** desktop/Android-emulation browser tests in a single full run (4.0 minutes). Retry recovery, shared grant/remove/leave, revoked access, reset expiry/replay/concurrent consumption, and session revocation were exercised. A separate disposable-account check returned the same public reset-request status for known/unknown emails during a simulated loopback SMTP outage.

The working tree was left unchanged by that review. No new dependency audit, default Turbopack check, Docker/Ubuntu deployment check, hardware Android test, or real-provider email test was performed. Provider delivery remains user-reported. Preparing task 005 is documentation work; the application checks above belong to the preceding review and were not rerun solely for these document changes.

## Important contracts

- Task 005 adds Project/Task canonical records via additive `202611050002_projects_tasks`, leaving the original migration untouched. Composite references and SQL triggers enforce consistent workspace/project/parent context, one-level hierarchy, and immutable assignments. Only Done means completed; parent/child statuses are independent. No content delete/archive/move endpoint exists.
- Content operations share the membership workspace lock and recheck access after waiting. GET/POST collections and GET/PATCH details live under `/api/workspaces/[id]/projects` and `/tasks`. Strict bodies, trusted Origin, no-store responses, monotonic revision compare/increment and safe 409 current-state responses apply. Shared owner/editor content rights are equal; membership management stays owner-only.
- Projects chooses one explicit workspace for that view. Refresh planning fetches shared changes; no live push. User/workspace/record-scoped drafts and pending-save locks span planner navigation in memory only. Conflicts require explicit review before another save. Access loss clears working content/drafts on the next fetch/action; sign-out/account change clears protected draft state. Reload/close may warn, but drafts are not durable/offline storage.
- Identity comes from verified database-backed Better Auth sessions. Personal workspaces require owner identity plus owner membership; shared workspaces require current membership. Filters never grant access.
- Shared mutations serialize on a workspace row lock and recheck authority. One owner plus editors only; no owner removal/leave/transfer, role changes, personal sharing/conversion or workspace deletion endpoints.
- Recovery uses Better Auth one-hour/single-use tokens and explicit Prisma adapter transactions for token consumption, credential changes and session revocation. Reset tokens are emailed in a URL fragment, removed from visible history after hydration and sent only in a POST body. Reopening the original link is required after losing the in-memory token on reload.
- SMTP requests need explicit `PASSWORD_RESET_ENABLED=true` and valid settings. `SMTP_FROM` accepts one plain mailbox or `Display Name <email>`. The diagnostic shares the runtime validator, loads Next development environment precedence, and prints names/overrides only; it does not test connectivity.
- Public registration remains disabled unless explicit local/test settings and loopback trusted URL agree. Password recovery does not settle public registration/invitation policy or verify account email addresses.

## Reviewed history / change inventory

Original transfer baseline: `6a1e5b0`. Independently reviewed baseline for task 005: `ca6fbc7`; no application changes were needed during that coordinator review. The task 005 implementation is subsequent, uncommitted work and has not received a second-agent review.

| Commit | Change |
| --- | --- |
| `59969a2` | Foundation |
| `c533335` | Accounts and personal workspaces |
| `228388e` | Shared workspace management and retry recovery |
| `c42d71b` | Password confirmation and SMTP recovery |
| `177b420` | Named SMTP sender support |
| `9c11a1d` | Safe email configuration diagnostic |
| `6a1e5b0` | Ubuntu test-server restart and SMTP troubleshooting docs |
| `ca6fbc7` | Coordinator transfer and user-reported SMTP resolution |

Task 005 adds application/schema/tests and updates README/product/architecture/roadmap/completion documents, preserving the coordinator's task-preparation changes. Stage only this assignment's files for the owner's commit; do not automatically commit, push, or deploy. No credentials, generated client, local database, or test screenshots belong in the staged diff.

## Next coordinator action

Review the task 005 diff and completion evidence, then prepare a bounded Kanban assignment over its canonical tasks, with explicit authorized workspace selection and non-drag status controls. Do not infer that task 005 starts board/calendar work or authorizes production deployment. Destructive lifecycle operations, assignment moves, and additional collaboration/identity policy remain deferred.

Durable user preference for continuing work: **stage changed files and provide a commit message whenever changes are made; leave committing/pushing to the owner unless explicitly instructed otherwise.** Preserve unrelated checkout changes. Re-read current instructions at handoff; do not assume this chat's live context or local secrets are available to another agent.
