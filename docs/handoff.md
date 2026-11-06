# Coordinator handoff — 2026-11-05

## Current state

Tasks 001–004 are implemented. The app has responsive placeholder planner views, Better Auth accounts/sessions, idempotent private personal workspaces, shared owner/editor membership management, working server-error retry, password confirmation, SMTP password recovery, named mail senders, and safe email-configuration diagnostics. Planner content and board/calendar filtering remain unimplemented.

Read `AGENTS.md`, `docs/product.md`, `docs/architecture.md`, `docs/stack.md`, and the task completion records before assigning dependent work. Task records contain the detailed verification evidence and contracts; this file summarizes the transfer to the coordinating agent.

## Latest operational resolution

The owner reports that recovery is now working after correcting **the Ubuntu server's** `~/github/Kanbrik/.env`. They had been editing the local Windows checkout's `.env`, which is independent and ignored by Git. The server diagnostic correctly showed that its saved file contained only the original database/auth settings and no SMTP block. Password punctuation was not the cause. No further application fix is indicated by that incident.

The owner hosts Mailcow and configured it themselves. Do not copy credentials into documentation, requests, fixtures, logs or commits. Real-provider success is **user-reported**, not an independently observed SMTP/inbox/TLS test by this agent.

The Ubuntu app is manually run on loopback port **3005**, accessed through an SSH tunnel. Port 3000 was already occupied by another Docker service. `BETTER_AUTH_URL` must match the browser/tunnel origin, currently `http://127.0.0.1:3005`. The README documents full code-update restart commands, environment-only restart, tunnel reconnection, database setup and `npm run email:check`. Restart after editing the server environment file; Git pulls do not synchronize ignored `.env` files.

## Verification carried forward

- Latest full unit/integration/database/SMTP/safety suite: **43 passed**. This includes prior workspace/session protections, actual loopback SMTP delivery, reset expiry/replay/concurrent-consumption checks, sender-format validation and safe configuration diagnostics.
- Latest applicable lint/strict TypeScript and `npm run build -- --webpack` checks passed. Schema validation passed during task 004; recovery and subsequent follow-ups added no migration/schema changes.
- Task 004 browser verification: initial full suite had **18 passes and 2 new recovery-test failures** caused by typing into the previous screen before navigation completed. After an explicit heading wait, a focused rerun passed **both desktop/Android recovery journeys**. All 20 distinct cases were verified across these runs; do not claim a subsequent single full-suite pass. Sender/diagnostic/doc follow-ups did not change the UI and did not rerun browser flows.
- Task 003 had a full **16/16** desktop/Android-emulation pass. Both default Turbopack and Webpack builds passed in its latest run; earlier default-build helper-process failures remain unexplained. Task 004 used Webpack and did not recheck the default build.
- Last production-dependency audit during recovery work reported **0 vulnerabilities**; eight moderate development-only linter-chain findings/support limitations remain documented in `docs/stack.md`. No new audit was run for the final documentation handoff.
- Real PostgreSQL 17.11 was run portably on Windows with guarded separate local/test databases. Automated SMTP sinks were loopback-only, memory-only and never relayed externally. No production server changes, external account configuration or real-provider sends were performed by the agent.

## Important contracts

- Identity comes from verified database-backed Better Auth sessions. Personal workspaces require owner identity plus owner membership; shared workspaces require current membership. Filters never grant access.
- Shared mutations serialize on a workspace row lock and recheck authority. One owner plus editors only; no owner removal/leave/transfer, role changes, personal sharing/conversion or workspace deletion endpoints.
- Recovery uses Better Auth one-hour/single-use tokens and explicit Prisma adapter transactions for token consumption, credential changes and session revocation. Reset tokens are emailed in a URL fragment, removed from visible history after hydration and sent only in a POST body. Reopening the original link is required after losing the in-memory token on reload.
- SMTP requests need explicit `PASSWORD_RESET_ENABLED=true` and valid settings. `SMTP_FROM` accepts one plain mailbox or `Display Name <email>`. The diagnostic shares the runtime validator, loads Next development environment precedence, and prints names/overrides only; it does not test connectivity.
- Public registration remains disabled unless explicit local/test settings and loopback trusted URL agree. Password recovery does not settle public registration/invitation policy or verify account email addresses.

## Reviewed history / change inventory

Baseline before this documentation handoff: `6a1e5b0` on `main`, clean and aligned with the recorded `origin/main` reference at inspection.

| Commit | Change |
| --- | --- |
| `59969a2` | Foundation |
| `c533335` | Accounts and personal workspaces |
| `228388e` | Shared workspace management and retry recovery |
| `c42d71b` | Password confirmation and SMTP recovery |
| `177b420` | Named SMTP sender support |
| `9c11a1d` | Safe email configuration diagnostic |
| `6a1e5b0` | Ubuntu test-server restart and SMTP troubleshooting docs |

The current handoff adds documentation only. No application checks were rerun for it; Markdown/diff review is the relevant verification. Changes are staged for the owner's commit; the agent does not automatically commit, push or deploy.

## Next coordinator action

Review the existing implementation/handoffs, then define the next bounded task for workspace-owned projects and tasks with the five fixed statuses before combined board/calendar work. Resolve material product choices through the product/architecture records. Do not infer that this handoff authorizes the next implementation phase or production deployment.

Durable user preference for continuing work: **stage changed files and provide a commit message whenever changes are made; leave committing/pushing to the owner unless explicitly instructed otherwise.** Preserve unrelated checkout changes. Re-read current instructions at handoff; do not assume this chat's live context or local secrets are available to another agent.
