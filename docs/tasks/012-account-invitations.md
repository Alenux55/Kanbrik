# 012: Invitation-only account signup

Status: Implemented as `1d93128`; independently reviewed on 2026-11-09 without new actionable invitation findings. Assigned by the owner on 2026-11-09; base `fa0923e`. No clean final full-suite pass is claimed; task 011 corrections remain open.

## Outcome and approved scope

The owner wants individual invitations instead of opening registration. They explicitly chose **account signup only**, with shared membership granted separately, and **only administrators listed in the server's .env** may invite. This task does not resolve task 011's outstanding history/test corrections or implement later planner features.

## Dependencies and inputs

Read AGENTS.md, product/architecture/stack, README setup/test commands and the coordinator handoff. Reuse Better Auth credentials, PostgreSQL/Prisma, verified account boundaries and the existing SMTP transport. The pinned Better Auth 1.7.18 signup source and crypto export were checked against [official email/password documentation](https://better-auth.com/docs/authentication/email-password); credential creation reuses its hash format/provider fields. No new dependencies or production-server changes.

## Scope and contract

- `INVITATION_ADMIN_EMAILS` is a comma-separated, case-normalized allowlist of existing account emails. A nonempty value closes public signup even if an old preview/local signup flag is enabled. Invalid entries fail closed; an empty allowlist disables invitations. HTTPS is required except explicit local/test loopback.
- User settings shows Account invitations only to verified allowlisted accounts. Every list/send/revoke API authenticates again, including expected-account rejection and exact Origin checks on mutations. Workspace ownership alone grants no invitation privileges.
- Administrators email a recipient-bound, 256-bit random link using the existing SMTP settings, independently of PASSWORD_RESET_ENABLED. The seven-day, single-use secret is stored only as SHA-256, placed in the URL fragment, removed from the visible URL after hydration and submitted only in POST bodies. Opening/checking a link never consumes it. No token/hash is returned in admin list/send responses.
- Resend rotates the link; revoke invalidates it. Sending is limited to one per recipient per minute and at most 20 distinct current invitation rows per administrator in a rolling hour. List shows the latest 100. Removing an issuer from the allowlist invalidates their outstanding links. SMTP failure invalidates the undelivered/uncertain link; UI retains input and offers refresh/retry.
- Acceptance requires a valid unexpired/unconsumed link and no current signed-in session. The recipient email cannot be changed. Matching password confirmation is a browser control; the server validates 12–128 characters and a 1–100-character name. Better Auth's pinned hash utility and credential schema are reused, without changing auth dependencies or issuing cookies from the invitation response.
- Claiming the invitation and creating user/credential rows is one transaction. Replays, concurrent claims, expiry, revocation and resend cannot create multiple accounts or overwrite credentials. The new account is email-verified through possession of the emailed link. Existing accounts use sign-in/recovery; invitations never reset their passwords.
- The recipient signs in normally. Existing personal-workspace bootstrap creates their private workspace at first authenticated planner access. No shared membership is created; the owner continues using Workspaces → Add existing account separately. No invitation delegates administrative rights.

## Acceptance and verification

- Invite-only works with public registration disabled at both UI and auth endpoint.
- Non-admins, anonymous callers, foreign Origins and obsolete account headers cannot manage invitations; an invitee has only a personal workspace.
- Meaningful PostgreSQL/HTTP tests cover recipient binding, expiry/replay/revoke/resend/concurrent claims, existing-account protection, SMTP failure and no response cookies.
- Desktop and Android-emulation browser flows cover admin send, delivered email, fragment removal, password confirmation, signed-in guard, acceptance/sign-in and lack of shared/admin access.
- Run README client generation, schema validation, additive development/test migration, lint/types, build, backend and browser commands. Record actual results below; distinguish any known pre-existing task 011 failure.
- Update README/product/architecture/handoff; stage task-owned changes and supply a commit message. Owner commits/pushes. No deployment.

## Completion handoff

Implemented allowlisted administration under User settings, recipient-bound emailed account signup, revoke/resend and no implicit shared membership. The additive `202611090001_account_invitations` migration adds only the invitation table/indexes/FK; existing account/work data is not rewritten. The shared SMTP validator/transport preserves password-recovery enablement while allowing invitation mail independently.

Checks actually run on Windows, Node 24.19.0/npm 12.0.2, portable PostgreSQL 17.11:

- `npm run db:generate`, `npm run db:validate`: passed.
- `npm run db:migrate` and `npm run db:test:migrate`: seventh migration applied to separate loopback development/test databases, with no reset. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference, exit 0.
- `npm run check`: lint/strict types passed. Webpack production build passed after the final same-tab fragment fix. An earlier default Turbopack build passed before that final client-only refinement.
- `npm test`: **94/94 checks across nine files passed**. This includes six invitation HTTP/PostgreSQL cases and three policy/SMTP cases, plus all 85 baseline checks. The final change after that backend run was confined to invitation fragment UI handling and browser assertions.
- Initial focused browser attempts failed first on an overly broad alert selector (Next's route announcer also matched), then caught a same-tab hash-only reopening that retained the secret in the visible URL. The selector is scoped to main; acceptance now listens for hash changes and ignores obsolete acceptance responses.
- Final focused `npm run test:e2e -- invitations.spec.ts`: **2/2 passed** on desktop/Pixel 7 emulation in 44.4 seconds, with keyboard/touch activation, actual loopback email delivery, closed public signup, signed-in guard, password confirmation, same-tab reopening, fragment removal, successful account sign-in and personal-only/no-admin access.
- Integrated `npm run test:e2e`: **61 passed / 2 failed / one intentional Android skip**, 64 cases in 15.0 minutes, exit 1. Both invitation cases passed. The desktop overflow failure is the coordinator's known task 011 post-drag Retry failure at `011-overflow.spec.ts:71` (254px palette width before/during; session screen remained gated). The other failure was Android `preview.spec.ts:58`, `page.goto: net::ERR_ABORTED` while switching the simulated HTTPS backend and clearing cookies. This is not a clean integrated pass.
- An unchanged isolated preview rerun reproduced the Android abort (**one passed / one failed**, 50.9 seconds). The fixture now signs out through the actual UI and waits for sign-in before replacing its backend/cookie jar, so an active planner gate cannot compete with the next navigation. No application auth safeguard or registration/cookie assertion was removed. Corrected focused `npm run test:e2e -- preview.spec.ts`: **2/2 passed** in 50.2 seconds. The full suite was not repeated after this test-only refinement; the earlier two failures remain part of the evidence. Task 011's Retry/history corrections are not implemented by this task.

The implementation was subsequently committed as `1d93128`; independent review follows below. Physical Android, Ubuntu/container runtime and real Mailcow delivery are not checked by local automation. No server/SSH/proxy/firewall/provider changes, real emails, dependency updates or deployment were performed by the implementing agent. The existing portable local database remains available; test accounts/workspaces are fixture-scoped. Task 011 history and post-drag Retry findings remain assigned separately in `011-review-fixes.md`, regardless of whether its intermittent test passes in this run.

For deployment, the owner pulls the committed implementation on Ubuntu, preserves the server's existing `.env`/SMTP credentials, sets `INVITATION_ADMIN_EMAILS` to their exact existing login email, migrates, rebuilds and restarts using README. `ENABLE_PREVIEW_REGISTRATION=false` may stay set. Invitation administration appears under User settings only after restarting with a valid allowlisted account and HTTPS canonical URL. An invitation does not grant shared access or reset an existing account's password. Deployment has not been performed or verified by the coordinator.

Implementation commit message (subsequently committed as `1d93128`):

```text
Add administrator-controlled account invitations

Keep public signup closed and send single-use account invitation emails.
Add allowlisted administration, expiration, resend/revoke and atomic signup.
Preserve separate workspace grants and existing password recovery.
```

## Independent coordinator review — 2026-11-09

Reviewed committed implementation `1d93128` against parent `fa0923e`. No new actionable invitation defects found. Reviewed server-derived administrator authority, expected-account and Origin rejection, public-signup closure, recipient binding, hash-only token storage, expiry/rotation/revocation, atomic single-use credential creation, SMTP-failure cleanup, fragment lifecycle and separate workspace grants. The task 011 dialog and overflow-test files are unchanged; their two assigned P2 findings remain open.

Independently verified on the Windows checkout:

- `npm run check`: lint/strict types passed.
- `npm run db:validate`: passed. `npm run db:test:migrate`: all seven migrations present, none pending on the guarded loopback test database. This checks migration status, not fresh-cluster or pre-migration fixture preservation.
- `npm run build -- --webpack`: passed on the reviewed source.
- `npm run test -- --reporter=json --outputFile=.local/review012-tests.json`: **94/94 tests passed**, zero failures/skips, across nine files. Includes real PostgreSQL/HTTP invitation lifecycle and account-boundary checks plus loopback-only SMTP capture. The JSON run retained final counts after the preceding terminal output was truncated; its report is ignored local output, not a committed artifact.
- `npm run test:e2e -- auth.spec.ts invitations.spec.ts preview.spec.ts`: **12/12 passed in 2.7 minutes**, desktop and Pixel 7 touch emulation, including the corrected preview fixture, closed signup, emailed acceptance/sign-in and personal-only/no-admin access.
- `git diff --check fa0923e 1d93128`: passed. No application, dependency, schema or test changes made during review; only review/handoff documentation is updated.

The coordinator did not rerun the full integrated browser suite, default Turbopack build, schema-drift comparison, development migration or fresh-cluster preservation proof. The implementer's integrated 61 pass / two fail / one skip remains historical evidence, not a final clean pass. Physical Android, real Ubuntu/Nginx Proxy Manager/TLS and Mailcow delivery remain unverified by the coordinator; no external email or deployment was attempted. Task 012 is suitable to retain while implementing the outstanding [task 011 corrections](011-review-fixes.md) from current baseline `1d93128`, followed by a final integrated run and independent re-review.
