# 004: Password confirmation and email recovery

Status: Implemented and verified (2026-11-05). Owner-provided SMTP configuration and real-provider delivery remain separate setup steps.

## Outcome and scope

Requested directly after testing the account flow: add “Confirm your password” to account creation and “Forgot your password?” to sign-in. The owner selected automatic reset links and will configure SMTP. Implement complete request/reset screens and provider configuration using the existing authentication stack. Preserve identity/workspaces and server protections; do not change registration policy, deploy, configure external accounts or send real-provider emails during implementation.

## Inputs and contracts

- Read AGENTS.md and current product/architecture/stack guidance. Reuse task 003's guarded real PostgreSQL and desktop/Android checks.
- Better Auth owns reset credentials and tokens. Confirmation prevents browser entry mistakes; it is not a replacement authentication boundary.
- Add only SMTP delivery configuration and test tooling. No application schema/migration, planner content or workspace policy changes.

## Acceptance criteria

1. Sign-up requires a matching confirmation, focuses the mismatch field, and makes no signup request while passwords disagree.
2. Sign-in provides accessible recovery navigation. Recovery shows a clear unavailable state when SMTP is not configured.
3. Configured recovery sends a real reset email via SMTP, using a trusted application link, without exposing raw errors, passwords or tokens in logs.
4. Reset confirms the new password, enforces the existing minimum, supports one-hour single-use tokens, and revokes existing sessions. Old passwords/replayed/expired/invalid tokens fail; workspaces survive.
5. Actual database/HTTP/SMTP and desktop/mobile tests cover the new behavior while retaining prior sharing, auth and recovery checks.
6. Document configuration, provider/tunnel limitations, actual checks and staging. No external email configuration or production deployment is implied.

## Completion handoff

### Delivered

- `src/components/auth-form.tsx` adds a required “Confirm your password” field on sign-up, mismatch feedback/focus and no signup request until values agree. Confirmation is not sent or stored separately. Existing sign-in now links to recovery.
- Public `/forgot-password` and `/reset-password` screens use `src/components/password-recovery.tsx` for request/reset forms, pending/error states, confirmation, successful-reset sign-in guidance and missing-SMTP/missing-link states. Tokens are read after hydration from an emailed URL fragment, removed from visible history, retained only in current component memory and sent in a reset POST body. A ref guard preserves initialization under development Strict Mode. Reset pages set no-referrer metadata.
- `src/server/password-email.ts` uses stable Nodemailer 10.3.1 with server-only validated SMTP configuration, plain-text mail, explicit sender, disabled transport debugging, TLS/certificate checks and generic delivery errors. Requests remain disabled by default unless flag and settings validate. A plaintext exception is confined to explicit loopback local/test configuration. New environment placeholders and optional Compose forwarding are documented; no real credentials were added.
- Better Auth 1.7.18 owns generation, one-hour expiry, single use, password hashing and session revocation. Prisma adapter transactions are enabled to commit token consumption, session revocation and credential updates atomically. No application schema change or migration was needed; users/workspaces/memberships are preserved.
- The auth handler requires exact configured Origin for reset POSTs and fixes reset destinations to the trusted application's reset page. An initial direct-request test showed the library alone did not reject the supplied hostile redirect in this context; application checks now reject it while retaining library protections. Generated emails always use the server-configured origin, never a client-controlled reset destination.
- Tests add real SMTP delivery to an in-memory loopback sink (`tests/mail-capture.mjs`), with an inbox reader guarded by a per-run test secret. Tests override real SMTP configuration, use generated accounts, and clean only owned fixture users/workspaces/verification values. No mail/token logging, disk inbox, application test endpoint, external relay or provider account change is introduced.
- Exact new dependencies: Nodemailer 10.3.1, development `@types/nodemailer` 8.0.2, `smtp-server` 3.21.3 and `@types/smtp-server` 3.5.13. Stable registry metadata, official Better Auth/Nodemailer docs, installed adapter transaction/reset implementation and TypeScript usage were checked. No unrelated dependency upgrades.
- README, product scope, architecture, stack, roadmap and this task record explain implementation, configuration and remaining limits. This explicit user follow-up supersedes earlier task boundaries deferring password recovery; it does not settle registration/invitation policy or implement planner features.

### Actual checks

Windows, Node 24.19.0, npm 12.0.2, actual guarded portable PostgreSQL 17.11; SMTP test servers bind loopback only and never deliver externally.

| Command/check | Result |
| --- | --- |
| Exact npm installs / lockfile | Passed; versions pinned, existing moderate development linter-chain findings remain |
| `npm run check` | Passed: ESLint without warnings and strict TypeScript/Next route checks |
| `npm run build -- --webpack` | Passed; built app used for HTTP and browser tests |
| `npm run db:validate` | Schema valid; no migration/schema changes |
| `npm run test` | 25 passed: prior 21 database/HTTP/safety checks plus 4 SMTP/reset-security tests |
| `npm run test:e2e` | Initial full run: 18 passed, 2 new reset-journey tests failed due entering the previous sign-in form's same-labeled Email field before navigation completed |
| `npm run test:e2e -- --grep "password recovery delivers"` | After explicitly waiting for the recovery heading: both desktop and Android reset journeys passed. All 20 distinct browser checks were verified across the full run and focused rerun; a new full-suite pass is not claimed |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` and ignore checks | Passed; `.env`, `.env.test` and cluster data remain ignored |

Recovery integration evidence: actual SMTP-delivered link targets the configured origin with fragment token and no token query; a new password works, old password fails, old sessions are denied, and personal-workspace identity persists. Reused, expired, invalid and short-password resets fail. Simultaneous reset requests consume a token once (one success, one rejection). Known/unknown email requests return identical generic normal responses, and hostile Origin/redirect requests are denied.

Browser evidence on desktop and Pixel 7 touch emulation: mismatched sign-up confirmation focuses the field and sends zero signup requests; matching signup and all prior account flows pass. Reset request email is captured through SMTP, the real emailed link opens the reset form, the fragment disappears, mismatched new-password confirmation is rejected, matching reset succeeds and the new password signs in. Unconfigured recovery explains its state and rejects direct requests; missing-link recovery is available. Reset layout overflow checks pass. Traces/videos remain off to avoid recording secrets.

### Limitations / handoff

- The owner must configure an authorized SMTP sender/provider and restart the app. No real-provider email, inbox placement, spam filtering, or external TLS connection was tested. Local SMTP acceptance proves the application path, not actual provider delivery.
- Recovery mail links use BETTER_AUTH_URL. Local SSH users must have the matching tunnel running on the computer opening the link. After a reload that loses the in-memory token, reopen the email link; no durable browser token storage is implemented.
- Default Turbopack build was not rechecked for this follow-up; historical intermittent results remain documented in task 003. The Webpack build is verified. Docker/Compose runtime, Linux, real Android hardware and production deployment remain unverified; Compose email forwarding is scaffolding only.
- Public registration and email-address verification policies remain unchanged. Recovery email is not sign-up verification. No social login, invitation delivery, production account administration, planner CRUD, workspace policy or deployment changes were made.
- Next planner assignment remains a separately scoped workspace-owned projects/tasks task. SMTP credentials and provider setup belong in the owner's ignored environment, not a repository commit.
