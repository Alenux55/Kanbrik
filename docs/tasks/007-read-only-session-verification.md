# 007: Read-only session verification and delayed-cookie isolation

Status: Implemented and verified. Independent coordinator review remains next, before task 008.

Suggested model: GPT-6.1 Sol, High effort. Complete and review this fix before implementing task 008. No Kanban or calendar feature work is part of this task.

## Outcome

Planner identity checks cannot set, renew, restore, or delete the browser's authentication cookies. Delayed verification responses must not undo a later sign-in/sign-out, including when cross-tab notification hints are unavailable. Preserve task 006's verified identity gating, expected-account preconditions, draft invalidation, and obsolete-response protection.

## Baseline and evidence

- Read `AGENTS.md`, `docs/handoff.md`, task 006's completion record, and the session architecture. Current implementation is **committed as `0c13917`**, following preparation commit `c8fabab`; it is not staged/uncommitted application work.
- Independent review passed lint/types, schema validation, Webpack build, **54/54** unit/database/HTTP/SMTP checks, and **6/6 focused cross-tab browser tests** (desktop/Android). The coordinator did not independently rerun the implementer's 30-case full suite in that review; preserve that distinction.
- A separate deterministic renewal test failed the intended isolation contract despite those passes. No application fix has been applied yet. Planning data/schema changes are not needed for this correction.

## Reproduced failure

Use disposable A/B accounts sharing a workspace/task, with two pages in one browser context/cookie jar.

1. Sign in as A, open the shared task, and enter an A-only unsaved draft.
2. Make A's valid test session due for renewal. Review changed only its fixture session's expiry to one hour from now; installed Better Auth's normal refresh condition then applies. This is a valid session, not a forged credential.
3. Suppress the non-secret cross-tab invalidation pulses in the test context to exercise the documented fallback when hints are unavailable. Do not disable session verification, server authorization, or account preconditions.
4. Start a save and hold its session-verification response after the server has processed it. The response contains a renewal `Set-Cookie` header.
5. Sign in as B through the real form in the other page. Confirm the shared cookie jar's effective server session is B.
6. Release A's delayed verification response, with its original headers intact.

Observed: `verificationRenewedCookie=true`, `bSignedInBeforeRelease=true`, `effectiveAccountAfterReleaseIsA=true`, `obsoleteDraftSaved=true`, and the task revision advanced to 2. No production data/provider was used; owned fixtures were cleaned.

## Why task 006's guards are insufficient

`PlannerSession.verify()` currently calls the library's browser-facing `getSession` endpoint with cookie caching disabled. That does not disable cookie renewal or other cookie mutations. The browser applies `Set-Cookie` independently of JavaScript version/epoch checks. Once an old probe restores A's cookie, the A expectation matches the now-restored session, so the mutation precondition cannot detect B's overwritten sign-in. Aborting or ignoring the response body is not a cookie-isolation guarantee.

Installed library session code can also clear cookies for missing/expired sessions. Address both renewal and deletion paths; adding a renewal-only flag without examining other `Set-Cookie` behavior is insufficient.

## Required implementation

- Use a genuinely read-only planner-verification path whose browser responses never set or clear auth cookies, on successful, null/expired, invalid, and error results. A small server-owned probe that reads the verified database-backed session and returns a safe minimal identity result without forwarding cookie headers is one possible approach. Check the installed library APIs rather than assuming their names imply read-only behavior.
- Retain authoritative session expiry/revocation and cookie-cache bypass. Read-only verification must not become trusting cookie presence, a client user ID, local storage, or stale session data.
- Keep identity reads from silently extending session lifetime on every planner action. Specify how ordinary deliberate session renewal works, if needed, separately from identity probes. Do not globally disable secure cookies or change sign-in/out/password-reset protections to avoid this race.
- Preserve `PlannerSession`'s caller-facing verification/protected-request behavior where practical. Board task 008 depends on that shared abstraction, not a particular verification URL or Better Auth probe method. If that public contract must change, update task 008's integration notes before handoff.
- Preserve safe network-failure gating, same-account draft/conflict retention, A-to-B invalidation, account-header/workspace refresh, cross-tab logout, Strict Mode lifecycle behavior, and account/epoch-scoped fetches/callbacks.
- Preserve server `X-Kanbrik-Account` rejection checks and normal session/membership/Origin enforcement. The header remains a rejection precondition, never actor selection or authorization.
- Responses from probes already in flight before an identity transition must not restore A's cookie or erase B's cookie when released afterward. Do not claim that canceling a browser fetch reverses an already-applied cookie or committed transaction.
- Keep probe output minimal and uncached; never return/log raw cookies, session/reset tokens, credentials, or unnecessary account data. Follow existing same-origin application/session protections.

## Regression and acceptance criteria

1. Reproduce the renewal scenario above before the fix. After the fix, releasing the held A response leaves B as the effective server session, A's draft does not save, the task revision/text remain unchanged, and the original tab safely refreshes/gates its account context. Test code must not reload the original tab to repair it.
2. Test a delayed missing/expired-A verification response released after B signs in. It cannot clear B's authentication cookie/session. Distinguish stale UI-result handling from cookie-header effects.
3. Directly verify the actual browser-facing probe responses carry **no `Set-Cookie`**, including valid sessions due for refresh, expired/invalid sessions, and failure cases. Merely stripping headers in a mocked test response does not prove application behavior.
4. Use two pages sharing cookies and real form sign-in. Suppress only notification hints in the fallback cases. Preserve the original response headers in delay/interception tests; do not accidentally make the test pass by dropping the problematic header in the harness.
5. Existing expected-account mismatch, membership isolation/revocation, task revision conflicts, old-response/in-flight lock guards, session-check retry, same-user draft stability, and password-reset revocation continue to pass. Normal sign-in/out and legitimate session expiry still work.
6. New delayed-cookie browser regressions pass on desktop and Android emulation, and the relevant full regression suite passes or its exact failures/focused reruns are reported honestly.
7. No schema/migration, provider configuration, membership/registration policy, offline storage, or later feature change is introduced merely for this correction.

## Verification and completion handoff

Use real guarded PostgreSQL, per-run accounts, and memory-only loopback SMTP where existing checks require mail. Clean only owned fixtures; do not stop/reset shared databases or send real-provider email. Add permanent regression tests to the repository rather than relying only on an ignored one-off script.

Run relevant lint/types, schema validation, build, database/HTTP, and browser checks. Record exact commands and counts; separate default/fallback builds, focused/full runs, implementation evidence, and independent review. Preserve the historical task 006 results as history rather than rewriting them as proof of the new case.

### Implementation handoff — 2026-11-06

- Added `src/app/api/planner-session/route.ts`. The route owns every browser response/header: no-store minimal `{userId}` on valid/null identity, generic 503 on error, no library header forwarding. It does not expose cookies, session tokens, expiry metadata, email or other auth records. `src/lib/planner-session.ts` consumes and validates that minimal response while preserving the existing verification/protected-fetch interface, timeout, epochs, failure gating and account preconditions.
- `src/server/auth.ts` passes `disableCookieCache:true` and `disableRefresh:true` for shared server identity reads. Installed 1.7.18 session code was inspected: disabling refresh returns valid sessions without renewal, but expired/missing paths can still produce cookie deletions before that branch. Header isolation, not the renewal flag alone, prevents those effects. Expired database-session cleanup can still occur inside the library; valid session expiry is not extended. Deliberate sign-in creates a fresh session; normal auth endpoint cookie semantics and security are unchanged. No schema/dependency/provider/policy changes.
- Permanent browser regressions in `session-isolation.spec.ts` hold actual upstream renewal/expired responses with all headers intact, suppress only storage notification listeners, sign in as B through the real form in the same cookie jar, release A's old response, and verify B remains the effective account with saved task text/revision unchanged. A stale null result may safely gate at sign-in rather than displaying B immediately; B's real cookie remains intact. Existing session tests intercept the application probe instead of the old auth endpoint.
- Before-fix desktop reproduction against the existing task 006 build failed at the effective-account assertion after releasing the delayed renewal response: B was replaced by A. This independently confirms the cookie race, separate from the coordinator's earlier obsolete-draft/revision observation. No test code reloads the original tab to repair identity.
- `npm run check`, `npm run db:validate`, and `npm run build -- --webpack` passed. Default Turbopack and the development smoke were not rerun for this correction; earlier build results remain historical. No migration needed.
- `npm run test`: **55/55 passed** in four files, including all previous checks plus direct HTTP probe assertions for valid-due, empty, invalid, expired, and error responses. Every tested actual application response had no Set-Cookie; the due session retained its exact stored expiry. The error case exercises the generic catch with a mismatching account expectation, without injecting a production failure endpoint.
- Final `npm run test:e2e`: **34/34 passed in one full run (6.8 minutes)** against the Webpack build: 17 desktop and 17 Pixel 7/touch-emulated cases. Both renewal and expired-response regressions passed on each profile with original headers retained and notification hints suppressed. B remained the effective session and task text/revision stayed unchanged. All existing session/precondition/revocation/conflict/retry/recovery cases passed too. No focused repair rerun was needed after the final full suite; intentional bootstrap-failure logs are expected in retry tests.
- No independent review, physical Android, Ubuntu/Docker, real-provider email, backup/restore, deployment or new dependency audit was performed. Existing tests use real guarded local PostgreSQL and owned fixtures, with loopback-only SMTP. No shared database stop/reset or unrelated data cleanup.
- Owner explicitly chose to arrange coordinator review after 007. Task 008 was read but not implemented or integrated; its existing shared session abstraction remains compatible and its prerequisite is preserved.

Stage only this task's changes and provide a commit message. Leave commits, pushes, external accounts, server configuration, and deployment to the owner. Once independently reviewed, task 008 may proceed separately; do not implement it as part of this fix.
