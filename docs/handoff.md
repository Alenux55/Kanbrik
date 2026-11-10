# Coordinator handoff — 2026-11-09

## Current state

Task 011's full planner redesign is committed as `a621e0f`, following design commit `48aa587` and HTTPS preview `0a16f7d`. Sidebar defaults, shared editors, hierarchy, compact Board/filtering, Calendar gestures and user/workspace settings are implemented; see the [implementation record](tasks/011-implementation.md). Independent coordinator review on 2026-11-09 found two P2 corrections: phantom editor history entries and a swallowed Retry click in the overflow regression. The stale handoff status was a third, P3 finding, corrected by this preparation. The next assignment is [011 review fixes](tasks/011-review-fixes.md), followed by re-review. Checklist/inbox persistence remains unimplemented; no deployment was performed by the agent.

Read `AGENTS.md`, `docs/product.md`, `docs/architecture.md`, `docs/stack.md`, and the task completion records before assigning dependent work. Task records contain the detailed verification evidence and contracts; this file summarizes the transfer to the coordinating agent.

The session corrections are [task 006](tasks/006-cross-tab-session-isolation.md) at `0c13917` and [007: read-only session verification](tasks/007-read-only-session-verification.md) at `47993fa`. Owner-confirmed 007 approval preceded [008: Kanban board](tasks/008-kanban-board.md) at `500b136`. Task 009 consumes those reviewed shared contracts; do not reopen identity or membership policy as part of scheduling.

## Latest operational resolution

The owner reports that recovery is now working after correcting **the Ubuntu server's** `~/github/Kanbrik/.env`. They had been editing the local Windows checkout's `.env`, which is independent and ignored by Git. The server diagnostic correctly showed that its saved file contained only the original database/auth settings and no SMTP block. Password punctuation was not the cause. No further application fix is indicated by that incident.

The owner hosts Mailcow and configured it themselves. Do not copy credentials into documentation, requests, fixtures, logs or commits. Real-provider success is **user-reported**, not an independently observed SMTP/inbox/TLS test by this agent.

The earlier Ubuntu setup used a manual loopback app on port **3005** and an SSH tunnel. The owner subsequently chose Nginx Proxy Manager HTTPS with an HTTP upstream at `10.0.0.95:3005`; keep the browser-facing HTTPS subdomain in `BETTER_AUTH_URL`. The owner reported Ubuntu Git HEAD at `a621e0f`, but the coordinator has not inspected the live instance or confirmed its running build. `npm run start` requires rebuilding and restarting after a pull; follow README migrations/build/start instructions. Git pulls do not synchronize ignored `.env` files.

## Verification carried forward

- Task 008 implementation: both builds, lint/types, schema/client generation, guarded test migration, and **59/59** database/HTTP checks passed. Development fixtures (including canonical Project/Task) retained identical row digests through the additive preference migration; a fresh isolated cluster applied all three migrations with no schema drift and was stopped. Final full browser suite passed **40/40** (8.1 minutes), including six new desktop/Android board cases and all 34 existing regressions. Screenshots were inspected on both viewport profiles. Production audit reports 0 vulnerabilities; original 8 moderate dev-only findings remain. These are implementation results; independent review evidence follows below.

## Task 009 implementation and verification

Calendar has workspace-owned one-off blocks, exclusive same-workspace project/task references, revision-safe changes/removal, separate saved view preferences, UTC instants with IANA editing/display zones, explicit DST choices, and idempotent create intents. Desktop uses a matching FullCalendar Standard 6.1.22 family with the existing dnd-kit palette for assignment onto an existing empty block; Android uses explicit agenda/forms. The existing verified account/epoch boundary owns Calendar drafts and pending locks. Failed, uncertain, conflicting, partial and revoked states remain explicit. Retained drafts can reconcile an already removed block after navigation. Canonical work is never copied, completed or deleted by scheduling.

The original task 009 implementation's client generation, schema validation, additive guarded migrations, final lint/types/default build and **74/74** backend checks passed. Existing development rows retained identical digests; a fresh guarded cluster applied all four migrations with no schema drift and was stopped. Runtime dependency audit is **0**; the same **8 moderate** development-only linter-chain findings remain. Final `npm run test:e2e` passed **52/52 in one full run (10.8 minutes)** on the final default Turbopack build, including all 40 existing cases and 12 Calendar cases; see the task record for earlier interrupted/focused runs. Screenshots use desktop and Pixel 7 emulation, not physical hardware. No provider or production server changes.

Coordinator review of `82d60e4` found one P2: a deleted gesture target incorrectly revoked the whole working workspace and discarded unrelated drafts. The follow-up checks workspace access separately and preserves unrelated drafts on a missing block or failed check; genuine revocation still clears the workspace, and obsolete recheck results are ignored. After the shutdown, correction verification resumed on 2026-11-08: lint/types, default build, migration status, 74 backend checks and six focused correction/session cases passed. The final full browser run passed **56/56 in one run (11.6 minutes)**, including all 52 prior cases and four new regressions. The correction and handoff are staged; coordinator re-review remains pending. The owner commits/pushes after review. Apply the new additive migration during the README's test-server restart sequence; do not reset the database.

## Task 010: HTTPS preview access

The user chose Nginx Proxy Manager HTTPS termination with an HTTP upstream at `10.0.0.95:3005`. Keep NPM's destination scheme HTTP and select a certificate/Force SSL for the browser-facing subdomain. The server's `BETTER_AUTH_URL` is that HTTPS origin, not the upstream IP URL. The exact hostname was not supplied; README uses a placeholder. The actual server `.env`, DNS, proxy, certificate and firewall have not been changed by the agent.

`KANBRIK_ENV=preview` plus `ENABLE_PREVIEW_REGISTRATION=true` plus an HTTPS canonical URL explicitly enables account creation. Turning the flag off keeps existing sign-in. Local/test loopback registration and default production denial are preserved. Workspace membership, trusted Origin, secure cookies and canonical work boundaries are unchanged. Signup gives a private personal workspace; the owner grants shared editor access separately. Anyone reaching an enabled preview can register, so keep the intended LAN/VPN audience restriction at the proxy/network. See task 010 for actual verification and scope.

Task 010 passed lint/types, Webpack build, **76/76 backend checks**, **8/8 focused auth browser cases** and **2/2 focused simulated-HTTPS-preview cases** across desktop/Android emulation. The final preview run passed after correcting harness teardown/selector failures; see its record. These are separate focused runs, not a full integrated 58-case pass, and do not verify actual TLS/proxy/Ubuntu configuration. No schema, dependency, real-provider or server changes. The owner commits/pushes the staged changes before applying the README settings on Ubuntu.

## Task 011: desktop feedback and settings follow-up

The owner requests a sidebar default workspace, shared overlay editors for projects/tasks/subtasks/blocks, expandable project/task/subtask lists, compact whole-card desktop Board dragging with project colors, a Board Filter panel (workspace/project/created/edited dates), a Calendar drag-overflow fix, and one-hour block creation from blank-slot work drops. They then requested time-zone settings and clarified that each workspace has a canonical zone, while users enter/edit/view schedules in their own zones from anywhere. Their screenshots show current density/drag symptoms; they are desktop observations, not evidence that mobile requirements can be dropped.

Task 011 records the full list and recommendations: preserve saved ownership despite sidebar defaults, keep multi-workspace filters separate, and retain tap/keyboard alternatives. The clarified time model supersedes the initial proposal to use a workspace zone as the creation form's default: users enter/view/edit in their own zone; the workspace zone supplies the shared reference. Keep UTC instants and workspace IANA metadata separately so both views represent the same moment, independently of server location. Existing block instants and dirty input never shift with settings. Evolve the legacy per-block editing-zone API explicitly. Workspace-setting permissions/backfill and record transfers are not newly confirmed requirements.

The owner assigned all slices A–E together, and they are implemented in `a621e0f`. Do not restart slice A or the full redesign from this historical feedback. The independent review passed lint/types, schema/migration status, Webpack build and **85/85 backend checks**. The full browser run produced **60 passed / 1 failed / 1 intentional Android skip** in 14.2 minutes; the failure was the post-drag Retry activation, while the measured overflow dimensions stayed stable. A separate disposable-account test confirmed the extra dialog Back step and zero probe requests after the swallowed mouse click; keyboard Retry recovered. See [review fixes](tasks/011-review-fixes.md) for concrete reproductions, acceptance criteria and verification expectations. Task 011 is implemented but needs these corrections and re-review before acceptance.

## Task 008 integration contract

Board reuses canonical tasks and the corrected session abstraction, with server-saved user-owned BoardPreference selections. It defaults only to personal, persists cleared selection, validates/deduplicates IDs, filters inaccessible IDs at read, and never grants access from filters. Strict status-only PATCH uses existing workspace locks, rechecks and expected revision/account; text/context/parent-child independence are preserved. Multi-scope failures label counts incomplete and remove that scope's editable cards. Selection generations, context guards and shared in-flight locks prevent obsolete responses from restoring deselected/old-account cards or releasing a new account's lock. Projects drafts retain original revisions. Desktop has five columns and MouseSensor drag handles; narrow screens use status tabs and explicit selectors. Task 009 must preserve these reviewed behaviors.

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

### Task 008 review at `500b136`

Independent review on 2026-11-06 found no actionable code defects. Passed `npm run check`, `npm run db:validate`, `npm run db:test:migrate` (no pending migrations), `npm run build -- --webpack`, **59/59 backend tests**, and **6/6 focused board browser cases** in 1.4 minutes across desktop and Pixel 7 touch emulation. Reviewed status-only/preference authorization, pointer/control moves, conflicts, retained Projects drafts, incomplete loads, delayed-probe/account switching and actual membership removal; inspected both layout screenshots. The review left the working tree unchanged.

The coordinator did not independently repeat the full 40-case suite, default build, migration fixture/fresh-cluster proof, audit, hardware Android or provider/deployment checks. At task-009 preparation HEAD was still `500b136` with a clean tree; the review evidence above was carried forward, not rerun for documentation changes. The board is suitable as the next feature's baseline.

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

Original transfer baseline: `6a1e5b0`. Task 005 is committed as `0929f9a`; the first account-switch handoff is `c8fabab`; task 006 is committed as `0c13917` and has received coordinator review. Task 008 built on approved `47993fa` and is committed/reviewed as `500b136`. Use Git history to identify subsequent implementation commits rather than carrying forward a stale staged/uncommitted description.

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
| `500b136` | Kanban board, saved workspace selection and status-only moves; independently reviewed |
| `82d60e4` | Calendar time blocks; coordinator found the deleted-block gesture P2, corrected in the current follow-up |
| `da206b5` | Deleted-block correction; independently re-reviewed without actionable findings |
| `0a16f7d` | HTTPS preview registration support and proxy setup guidance |
| `48aa587` | Planner usability and clarified user/workspace time-zone design |
| `a621e0f` | Full task 011 implementation; coordinator review identified two P2 corrections |

Tasks 001–011 are committed through `a621e0f`. The current documentation preparation records the coordinator review and assigns corrective work; it does not implement those runtime/test fixes. Do not automatically commit, push, or deploy; credentials, generated files, local databases, and test artifacts do not belong in the staged diff.

## Next coordinator action

Implement the two P2 corrections in [011 review fixes](tasks/011-review-fixes.md), preserving the completed redesign and the corrected handoff metadata. Verify the history lifecycle and reliable post-drag session recovery, run the final integrated suite, and return completion evidence for independent re-review. Do not start later roadmap features or redo slices A–E.

Suggested implementation prompt: "Read AGENTS.md, docs/handoff.md, docs/tasks/011-implementation.md and docs/tasks/011-review-fixes.md. Starting from a621e0f, fix the extra dialog history entry and the unreliable post-drag Retry activation in the overflow regression. Preserve dirty/pending/Back/focus/account-boundary behavior and all delivered task 011 features. Add meaningful regressions, verify the final integrated suite, and update completion/handoff evidence. Stage task-owned changes and provide a commit message; leave commit/push/deployment to me."

Provider/deployment, work deletion/archive/moves and identity/membership policy remain outside task 009; block removal is its expressly scoped lifecycle operation. The adopted Calendar defaults are bounded implementation choices, not new user-confirmed product requirements.
