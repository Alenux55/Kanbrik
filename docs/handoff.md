# Coordinator handoff — 2026-11-06

## Current state

Tasks 001–007 are committed through `47993fa`; task 008 is implemented and verified as staged/uncommitted work, ready for board review. The app has Better Auth accounts/sessions, personal/shared workspaces, recovery/email diagnostics, project/task planning, and cross-tab session/draft guards. Task 007 now corrects the independently reproduced delayed session-cookie race; its implementation evidence is below; the owner confirmed review approval before task 008 began. Projects supports one-level subtasks, fixed statuses, revision conflicts, and in-session drafts. The Kanban board now shows canonical tasks across saved workspace selections. Calendar/checklist/inbox persistence remains unimplemented. No production deployment was performed.

Read `AGENTS.md`, `docs/product.md`, `docs/architecture.md`, `docs/stack.md`, and the task completion records before assigning dependent work. Task records contain the detailed verification evidence and contracts; this file summarizes the transfer to the coordinating agent.

The current corrective implementation is [task 006](tasks/006-cross-tab-session-isolation.md), committed as `0c13917` after planning commit `0929f9a` and preparation `c8fabab`. [007: read-only session verification](tasks/007-read-only-session-verification.md) is committed as `47993fa` and owner-confirmed approved. [008: Kanban board](tasks/008-kanban-board.md) is separately specified because its task/status/workspace contracts are unaffected by the probe fix, and now consumes its approved shared session contract. The owner explicitly confirmed 007 approval and authorized task 008; independent review command details were not supplied and are not invented here.

## Latest operational resolution

The owner reports that recovery is now working after correcting **the Ubuntu server's** `~/github/Kanbrik/.env`. They had been editing the local Windows checkout's `.env`, which is independent and ignored by Git. The server diagnostic correctly showed that its saved file contained only the original database/auth settings and no SMTP block. Password punctuation was not the cause. No further application fix is indicated by that incident.

The owner hosts Mailcow and configured it themselves. Do not copy credentials into documentation, requests, fixtures, logs or commits. Real-provider success is **user-reported**, not an independently observed SMTP/inbox/TLS test by this agent.

The Ubuntu app is manually run on loopback port **3005**, accessed through an SSH tunnel. Port 3000 was already occupied by another Docker service. `BETTER_AUTH_URL` must match the browser/tunnel origin, currently `http://127.0.0.1:3005`. The README documents full code-update restart commands, environment-only restart, tunnel reconnection, database setup and `npm run email:check`. Restart after editing the server environment file; Git pulls do not synchronize ignored `.env` files.

## Verification carried forward

- Task 008 implementation: both builds, lint/types, schema/client generation, guarded test migration, and **59/59** database/HTTP checks passed. Development fixtures (including canonical Project/Task) retained identical row digests through the additive preference migration; a fresh isolated cluster applied all three migrations with no schema drift and was stopped. Final full browser suite passed **40/40** (8.1 minutes), including six new desktop/Android board cases and all 34 existing regressions. Screenshots were inspected on both viewport profiles. Production audit reports 0 vulnerabilities; original 8 moderate dev-only findings remain. The board's independent review is not yet performed.

## Task 008 integration contract

Board reuses canonical tasks and the corrected session abstraction, with server-saved user-owned BoardPreference selections. It defaults only to personal, persists cleared selection, validates/deduplicates IDs, filters inaccessible IDs at read, and never grants access from filters. Strict status-only PATCH uses existing workspace locks, rechecks and expected revision/account; text/context/parent-child independence are preserved. Multi-scope failures label counts incomplete and remove that scope's editable cards. Selection generations, context guards and shared in-flight locks prevent obsolete responses from restoring deselected/old-account cards or releasing a new account's lock. Projects drafts retain original revisions. Desktop has five columns and MouseSensor drag handles; narrow screens use status tabs and explicit selectors. Review task 008's full completion evidence before any calendar assignment.

## Historical verification

- Task 007 implementation: lint/types, schema validation, Webpack build and **55/55** unit/database/HTTP/SMTP checks passed; the full **34/34** desktop/Android browser run passed in 6.8 minutes. Direct probe responses had no Set-Cookie for due/expired/missing/invalid/error cases, and due expiry did not advance. The pre-fix delayed-response regression restored A over B as reported; new renewal/deletion fallback cases pass on both desktop and Android, with B preserved and no obsolete task save. These are implementation results, not independent review. See task 007 for final evidence.
- Task 006: lint/types, schema validation, both default Turbopack and Webpack builds, **54/54** unit/database/HTTP/SMTP checks, an initial focused **6/6** cross-tab run, an isolated local dev/Strict Mode smoke, and a final **30/30** full desktop/Android browser run (6.1 minutes) passed. The new real-session precondition check rejects an old account expectation with a new account's valid shared-editor session, without changing data or signing it out. New browser cases use one cookie jar, real form sign-in, no test reload of the old tab, and deterministic held requests/responses. See task 006 for exact before/after evidence and limitations. No schema/dependency changes or migration needed for this fix.
- Task 005's prior full unit/integration/database/SMTP/safety suite: **53 passed**, including 10 planning checks plus all 43 prior protections. Content checks cover direct SQL relationship rejection, personal/shared isolation, atomic revision conflicts/rollback, and an HTTP editor save confirmed blocked behind removal before returning 404 after revocation.
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

A separate two-tab test found a P2 gap at `0929f9a`: A's unsaved shared-task draft and account header remain in the original tab after B signs in through another tab sharing its cookie jar. Requests authenticate as B, even after Board → Projects navigation. The layout key alone did not detect that change. This was a UI/draft-isolation defect, not evidence of a server membership bypass. Task 006 now implements the correction and explicit same-cookie regressions; the implementation still needs independent review. The earlier correction identifying task 005 as committed `0929f9a` remains valid.

The `c8fabab` task 006 preparation was documentation-only; its carried application results were from that earlier coordinator review. The subsequent task 006 application/test implementation and its new verification are recorded separately above and in the task's completion handoff.

### Task 006 review at `0c13917`

Independent review passed `npm run check`, `npm run db:validate`, `npm run build -- --webpack`, **54/54** unit/database/HTTP/SMTP checks, and **6/6 focused cross-tab browser cases** (1.3 minutes). It did not independently repeat the implementer's 30-case full suite or recheck default-build, provider/deployment, hardware, or dependency-audit behavior. The working tree was left unchanged.

At baseline `0c13917`, a separate renewal test found a P2 race: with notification hints unavailable, A's verification response contains renewal `Set-Cookie`; after B signs in, releasing that response restores A's cookie and A's obsolete draft saves (revision 2). JavaScript version/epoch guards cannot undo browser cookie-header effects. Task 007 subsequently implemented the cookie-immutable probe and permanent delayed renewal/expiry regressions; owner-confirmed approval allowed 008 to proceed. This is distinct from the original stale-layout bug. No production data/provider was involved. Earlier descriptions of task 006 as staged/uncommitted are corrected to `0c13917`.

Commit `e4224a9` prepared tasks 007/008 as documentation only. Its coordinator results are historical. Task 007 subsequently added source and permanent regressions and was committed as `47993fa`; the owner confirmed its approval before 008.

## Important contracts

- Task 005 adds Project/Task canonical records via additive `202611050002_projects_tasks`, leaving the original migration untouched. Composite references and SQL triggers enforce consistent workspace/project/parent context, one-level hierarchy, and immutable assignments. Only Done means completed; parent/child statuses are independent. No content delete/archive/move endpoint exists.
- Content operations share the membership workspace lock and recheck access after waiting. GET/POST collections and GET/PATCH details live under `/api/workspaces/[id]/projects` and `/tasks`. Strict bodies, trusted Origin, no-store responses, monotonic revision compare/increment and safe 409 current-state responses apply. Shared owner/editor content rights are equal; membership management stays owner-only.
- Projects chooses one explicit workspace for that view. Refresh planning fetches shared changes; no live push. Drafts and pending-save locks span navigation in memory only. Task 006 puts the whole shell behind a live server-verified session boundary with versioned checks, account/epoch-scoped requests/callbacks, neutral checking/retry screens, and non-secret auth invalidation pulses. Confirmed identity changes clear state and replace the document, refreshing header/workspace options and preventing draft resurrection; same-account checks preserve drafts and conflicts. Notifications are hints, with independent focus/navigation/action checks and no polling. Suspended tabs cannot retract information already viewed/downloaded.
- Protected UI requests include `X-Kanbrik-Account` solely as a rejection precondition; a mismatch with the verified cookie session returns safe 412, including sign-out. Matching/omitted expectations never grant access. However, an old verifier that restores A's cookie also makes A's expectation match again: the header alone cannot close the cookie race; task 007 additionally isolates every probe response header. Old-context JavaScript callbacks are guarded and network errors gate editing, but task 007 now prevents those cookie headers from reaching the browser through planner probes. Cancellation never promises rollback of a committed transaction or reversal of cookie effects.
- Identity comes from verified database-backed Better Auth sessions. Personal workspaces require owner identity plus owner membership; shared workspaces require current membership. Filters never grant access.
- Shared mutations serialize on a workspace row lock and recheck authority. One owner plus editors only; no owner removal/leave/transfer, role changes, personal sharing/conversion or workspace deletion endpoints.
- Recovery uses Better Auth one-hour/single-use tokens and explicit Prisma adapter transactions for token consumption, credential changes and session revocation. Reset tokens are emailed in a URL fragment, removed from visible history after hydration and sent only in a POST body. Reopening the original link is required after losing the in-memory token on reload.
- SMTP requests need explicit `PASSWORD_RESET_ENABLED=true` and valid settings. `SMTP_FROM` accepts one plain mailbox or `Display Name <email>`. The diagnostic shares the runtime validator, loads Next development environment precedence, and prints names/overrides only; it does not test connectivity.
- Public registration remains disabled unless explicit local/test settings and loopback trusted URL agree. Password recovery does not settle public registration/invitation policy or verify account email addresses.

## Reviewed history / change inventory

Original transfer baseline: `6a1e5b0`. Task 005 is committed as `0929f9a`; the first account-switch handoff is `c8fabab`; task 006 is committed as `0c13917` and has now received coordinator review. Task 008 application baseline is approved commit `47993fa`. Use Git history to identify subsequent implementation commits rather than carrying forward a stale staged/uncommitted description.

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
| `c8fabab` | Corrective cross-tab isolation assignment and coordinator review history |
| `0c13917` | Planner session/draft guards and expected-account preconditions; reviewed with remaining delayed-cookie finding |
| `47993fa` | Cookie-immutable planner identity probe; owner confirmed approval before 008 |

Tasks 001–007 and preparation `e4224a9` are committed. Current task 008 application, additive migration, dependency lock, tests and documentation are staged/uncommitted work for the owner. Do not automatically commit, push, or deploy; credentials, generated files, local databases, and test artifacts do not belong in the staged diff.

## Next coordinator action

Independently review the integrated task 008 board, its migration/status-only/preference contracts, and full regression evidence. Task 007 approval was explicitly confirmed by the owner; it is not a pending prerequisite now. A separately specified Calendar/time-block task follows only after board review. Do not combine the two implementation scopes or start Calendar automatically. Provider/deployment, destructive lifecycle operations, assignment moves, and identity/membership policy remain outside these assignments.

Durable user preference for continuing work: **stage changed files and provide a commit message whenever changes are made; leave committing/pushing to the owner unless explicitly instructed otherwise.** Preserve unrelated checkout changes. Re-read current instructions at handoff; do not assume this chat's live context or local secrets are available to another agent.
