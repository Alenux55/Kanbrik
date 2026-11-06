# Coordinator handoff — 2026-11-05

## Current state

Tasks 001–005 are implemented. The app has Better Auth accounts/sessions, private personal workspaces, shared owner/editor management, server-error retry, password confirmation, SMTP recovery, named senders, safe email diagnostics, and workspace-owned project/task planning. Projects supports standalone/project tasks, one-level subtasks, five fixed statuses, revision conflicts, and in-session drafts. Board/calendar/checklist/inbox persistence remains unimplemented. No production deployment was performed.

Read `AGENTS.md`, `docs/product.md`, `docs/architecture.md`, `docs/stack.md`, and the task completion records before assigning dependent work. Task records contain the detailed verification evidence and contracts; this file summarizes the transfer to the coordinating agent.

The current implementation is [005: workspace-owned projects and tasks](tasks/005-projects-tasks.md), committed as `0929f9a`. Independent review found a cross-tab account-switch isolation gap despite the existing tests passing. The next assignment is [006: cross-tab session and planning-draft isolation](tasks/006-cross-tab-session-isolation.md), not started. Fix and review that boundary before assigning Kanban work; board/calendar implementation remains separate.

## Latest operational resolution

The owner reports that recovery is now working after correcting **the Ubuntu server's** `~/github/Kanbrik/.env`. They had been editing the local Windows checkout's `.env`, which is independent and ignored by Git. The server diagnostic correctly showed that its saved file contained only the original database/auth settings and no SMTP block. Password punctuation was not the cause. No further application fix is indicated by that incident.

The owner hosts Mailcow and configured it themselves. Do not copy credentials into documentation, requests, fixtures, logs or commits. Real-provider success is **user-reported**, not an independently observed SMTP/inbox/TLS test by this agent.

The Ubuntu app is manually run on loopback port **3005**, accessed through an SSH tunnel. Port 3000 was already occupied by another Docker service. `BETTER_AUTH_URL` must match the browser/tunnel origin, currently `http://127.0.0.1:3005`. The README documents full code-update restart commands, environment-only restart, tunnel reconnection, database setup and `npm run email:check`. Restart after editing the server environment file; Git pulls do not synchronize ignored `.env` files.

## Verification carried forward

- Latest full unit/integration/database/SMTP/safety suite: **53 passed**, including 10 new planning checks plus all 43 prior protections. Content checks cover direct SQL relationship rejection, personal/shared isolation, atomic revision conflicts/rollback, and an HTTP editor save confirmed blocked behind removal before returning 404 after revocation.
- Task 005 lint/strict TypeScript, schema/client generation, development/test migrations, default Turbopack and Webpack builds passed. The final regression server uses the Webpack build. Historical default-build failures remain unexplained; no root-cause fix is claimed. A seeded pre-migration development fixture retained identical whole-row digests in existing tables. A separate fresh guarded database applied both migrations with no Prisma schema drift, then its temporary portable cluster was stopped. See task 005 for exact evidence and artifact limitations.
- Original task 005 browser evidence included focused **4/4**, an earlier full **24/24**, and a final implementation run with **23 passes plus one Chromium fixture-navigation failure**, followed by its successful focused rerun. The subsequent coordinator review of committed `0929f9a` independently passed **all 24/24 in one full run (4.8 minutes)**. This newer full pass does not cover the separately reproduced cross-tab account-switch gap; see task 006. Preserve the distinction between implementation-era partial/focused results and coordinator full-run evidence.
- Original task 004 browser verification: initial full suite had **18 passes and 2 new recovery-test failures** caused by typing before navigation completed; a focused rerun then passed both recovery journeys. The later independent coordinator review at `ca6fbc7` passed **all 20 cases in one full run**. Do not conflate the earlier partial/focused evidence with this newer full-suite result.
- Task 003 had a full **16/16** desktop/Android-emulation pass. Both default Turbopack and Webpack builds passed in its latest run; earlier default-build helper-process failures remain unexplained. Task 004 used Webpack and did not recheck the default build.
- Last production-dependency audit during recovery work reported **0 vulnerabilities**; eight moderate development-only linter-chain findings/support limitations remain documented in `docs/stack.md`. No new audit was run for the final documentation handoff.
- Real PostgreSQL 17.11 was run portably on Windows with guarded separate local/test databases. Automated SMTP sinks were loopback-only, memory-only and never relayed externally. No production server changes, external account configuration or real-provider sends were performed by the agent.

## Independent coordinator review

Reviewed application/history through `ca6fbc7` on 2026-11-05 with no new actionable findings. Independently verified `npm run check`, `npm run db:validate`, `npm run build -- --webpack`, **43/43** unit/database/SMTP checks, and **20/20** desktop/Android-emulation browser tests in a single full run (4.0 minutes). Retry recovery, shared grant/remove/leave, revoked access, reset expiry/replay/concurrent consumption, and session revocation were exercised. A separate disposable-account check returned the same public reset-request status for known/unknown emails during a simulated loopback SMTP outage.

The working tree was left unchanged by that earlier review. No new dependency audit, default Turbopack check, Docker/Ubuntu deployment check, hardware Android test, or real-provider email test was performed. Provider delivery remains user-reported.

### Task 005 review at `0929f9a`

Independent checks passed `npm run check`, `npm run db:validate`, `npm run build -- --webpack`, **53/53** unit/database/SMTP checks, and **24/24** browser cases in a single full run (4.8 minutes). The review left the working tree unchanged and did not rerun default-build, production/provider, hardware, or dependency-audit checks.

A separate two-tab test found a P2 gap: A's unsaved shared-task draft and account header remain in the original tab after B signs in through another tab sharing its cookie jar. The original tab's requests authenticate as B, even after navigating Board → Projects. The current layout key does not reliably detect that identity change. This is an open UI/draft-isolation defect, not evidence that server membership checks were bypassed. Task 006 contains the reproduction, required synchronization behavior, mutation/in-flight guards, and regression criteria. The former statement that task 005 was uncommitted was also stale; the implementation is `0929f9a`.

Preparing task 006 is documentation work. Application results above are carried from the preceding review, not rerun solely for the document changes. New verification for this preparation is Markdown/link/diff checking.

## Important contracts

- Task 005 adds Project/Task canonical records via additive `202611050002_projects_tasks`, leaving the original migration untouched. Composite references and SQL triggers enforce consistent workspace/project/parent context, one-level hierarchy, and immutable assignments. Only Done means completed; parent/child statuses are independent. No content delete/archive/move endpoint exists.
- Content operations share the membership workspace lock and recheck access after waiting. GET/POST collections and GET/PATCH details live under `/api/workspaces/[id]/projects` and `/tasks`. Strict bodies, trusted Origin, no-store responses, monotonic revision compare/increment and safe 409 current-state responses apply. Shared owner/editor content rights are equal; membership management stays owner-only.
- Projects chooses one explicit workspace for that view. Refresh planning fetches shared changes; no live push. Drafts and pending-save locks span planner navigation in memory only, with workspace/entity/record keys under the layout's user key. Conflicts require explicit review before another save. Access loss clears working content/drafts on the next fetch/action; same-tab sign-out clears state. Cross-tab account changes are not reliably detected and can retain old-account drafts/header; task 006 must close that gap before unconditional account-isolation claims. Reload/close may warn; drafts are not durable/offline storage.
- Identity comes from verified database-backed Better Auth sessions. Personal workspaces require owner identity plus owner membership; shared workspaces require current membership. Filters never grant access.
- Shared mutations serialize on a workspace row lock and recheck authority. One owner plus editors only; no owner removal/leave/transfer, role changes, personal sharing/conversion or workspace deletion endpoints.
- Recovery uses Better Auth one-hour/single-use tokens and explicit Prisma adapter transactions for token consumption, credential changes and session revocation. Reset tokens are emailed in a URL fragment, removed from visible history after hydration and sent only in a POST body. Reopening the original link is required after losing the in-memory token on reload.
- SMTP requests need explicit `PASSWORD_RESET_ENABLED=true` and valid settings. `SMTP_FROM` accepts one plain mailbox or `Display Name <email>`. The diagnostic shares the runtime validator, loads Next development environment precedence, and prints names/overrides only; it does not test connectivity.
- Public registration remains disabled unless explicit local/test settings and loopback trusted URL agree. Password recovery does not settle public registration/invitation policy or verify account email addresses.

## Reviewed history / change inventory

Original transfer baseline: `6a1e5b0`. Task 005 started from reviewed `ca6fbc7` and is committed as `0929f9a`. The coordinator has now independently reviewed that implementation and assigned the open account-switch finding to task 006.

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
| `0929f9a` | Workspace-owned projects/tasks, migration, revision conflicts, and in-session drafts |

Task 005 is already committed. Current preparation adds task 006 and corrects review/handoff documentation only; the fix itself is not implemented. Stage only the changed documentation for the owner's commit. Do not automatically commit, push, or deploy; no credentials, generated client, local database, or test screenshots belong in the staged diff.

## Next coordinator action

Hand task 006 to the implementation agent when assigned by the owner. Require the same-cookie-jar two-tab regression and the relevant existing checks, then independently review the fix. A bounded Kanban assignment follows separately once this isolation gap is closed. No board/calendar work, production deployment, destructive lifecycle operation, assignment move, or new identity/membership policy is included in task 006.

Durable user preference for continuing work: **stage changed files and provide a commit message whenever changes are made; leave committing/pushing to the owner unless explicitly instructed otherwise.** Preserve unrelated checkout changes. Re-read current instructions at handoff; do not assume this chat's live context or local secrets are available to another agent.
