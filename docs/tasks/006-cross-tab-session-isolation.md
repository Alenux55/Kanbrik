# 006: Cross-tab session and planning-draft isolation

Status: Implemented as `0c13917` and independently reviewed; delayed verification cookie effects remain open in corrective task 007. Earlier implementation test evidence is preserved below.

Suggested model: GPT-6.1 Sol, High effort. Reuse the implementation chat and reread current repository instructions. This task does not include Kanban implementation.

## Outcome

Every open planner tab uses the current verified account identity. Signing into another account or signing out in one tab invalidates stale protected UI and planning state in other tabs when they resume or act. An account must never see or submit another account's unsaved draft merely because both can access the same workspace/task.

## Baseline and review evidence

- Read `AGENTS.md`, `docs/handoff.md`, the task 005 completion record, and relevant architecture/stack guidance.
- Current implementation is committed as `0929f9a` (`feat: add workspace-owned projects and tasks`). The working tree was clean at review. This corrects the earlier handoff's stale description of task 005 as uncommitted.
- Independent coordinator checks passed: lint/TypeScript, schema validation, Webpack production build, **53/53** unit/database/SMTP checks, and **24/24** desktop/Android-emulation browser tests in one full run (4.8 minutes).
- The account-switch scenario below was then reproduced separately and is not covered by those 24 passing cases. Passing existing tests does not establish that cross-tab identity isolation works.
- Historical default Turbopack failures remain unexplained. Preserve the documented fallback and report actual build results; no unrelated upgrade or build-tool rewrite.

## Reproduction

Use disposable accounts A and B that are both members of one shared workspace, with one saved task. Separate contexts may provision the accounts, but the two tabs in this reproduction must share **one browser context/cookie jar**.

1. In tab 1, sign in as A, open Projects, select the shared workspace, and edit the task description without saving. Use a recognizable A-only draft value.
2. Open tab 2 in that same browser context. Visit Sign in and sign in as B through the real form. Tab 2's full navigation does not reload tab 1.
3. In tab 1, use planner navigation to visit Board, return to Projects, and open the same shared task.
4. Current result: the header still says A and A's unsaved description reappears, while `/api/auth/get-session` in the shared context reports B. Subsequent requests use B's session cookie.

Review observed `effectiveAccountIsB=true`, `accountADraftStillVisible=true`, and `headerStillAccountA=true` together. Test code did not reload tab 1 to cause or repair the condition. Fixtures were cleaned without touching unrelated data.

## Cause and relevant implementation

- The protected server layout keys `PlanningDrafts` with the user ID from its render. Planner navigation reuses that layout, so a cookie/session identity change in another tab does not necessarily rerender it or change the key.
- The provider retains drafts, selected workspace, pending-save keys, and refresh state above planner routes. Its record keys contain workspace/entity/record context but depend on that layout boundary for user isolation.
- Existing same-tab sign-in/out document navigation and separate-context shared-edit tests do not exercise a stale tab sharing cookies with a new account.
- Relevant files include `src/app/(planner)/layout.tsx`, `src/components/planning-drafts.tsx`, `src/components/projects-planner.tsx`, `src/components/sign-out.tsx`, and `src/lib/auth-client.ts`. Inspect protected workspace screens too; fixing draft text alone must not leave a stale account header/context.

## Required behavior

### Synchronize verified identity

- Use the installed Better Auth/Next APIs and a small coherent session boundary. Do not assume a server-layout key alone is live session synchronization. Check supported session refresh and cross-tab notification behavior in the installed versions.
- Revalidate identity on relevant cross-tab authentication signals and when a dormant tab resumes/focuses, navigates within the planner, or is about to dispatch a protected mutation. Avoid a background polling loop without a demonstrated need.
- Cross-tab notifications are hints to refresh verified session state, not authority. Never grant access or select an acting user solely from a broadcast message, local storage value, or client-supplied user ID.
- While identity is unresolved or changing, prevent stale protected editing/submission and show a neutral checking/retry state. A session-check network error must not be mistaken for confirmed logout or a successful identity change.
- On confirmed A-to-B change, clear A's drafts, selected workspace, conflict/error/save messages, and pending-save bookkeeping before exposing B's editable planner. Refresh the actual account header, workspace options, and protected content together. A deliberate application-controlled document navigation is acceptable if it produces correct state without an obsolete draft-unload prompt.
- On confirmed logout in another tab, clear stale protected state and show or navigate to sign-in. Do not leave an editable old-account form. Continue to rely on server session/membership enforcement for all real requests.
- Normal revalidation or renewal within the same authenticated session must preserve that user's unsaved drafts and selection. Do not erase drafts simply because a session object is newly allocated, a request finishes, or expiry metadata changes.

### Guard mutations and in-flight work

- A stale account-A form must not dispatch A's draft using account B's now-current session. Coordinate session verification and mutation dispatch; merely clearing state after a save returns is insufficient. Any client identity expectation is a rejection/precondition check, never authorization in place of the verified server session.
- Scope loads, saves, and their completion callbacks to the originating authenticated context. Ignore or cancel obsolete completions so an A-era response cannot populate B's state, remove B's draft, release B's pending-save lock, or report A's save as B's success.
- Do not promise that aborting a fetch reverses a transaction already authorized/committed on the server. Keep the distinction between safely discarding an obsolete UI response and undoing a saved operation.
- Preserve existing same-user draft navigation, duplicate-submit protection, revision conflict review, membership revocation, personal privacy, and server-error retry behavior.
- Keep drafts in memory. Do not introduce durable offline storage or persist/broadcast passwords, session/reset tokens, credentials, or draft content. If a storage/broadcast pulse is used, it carries only the minimal non-secret invalidation signal.

## Tests and acceptance criteria

1. **Two-tab account switch:** automate the exact reproduction with A and B sharing a task and a cookie jar. Use actual sign-in, planner navigation, and the real draft form. Confirm B is the effective session, the header/context refreshes to B, A's unsaved text is absent, and no stale A-draft mutation is dispatched. Existing saved shared content remains available to B under normal permissions.
2. **No resurrection:** after switching back to A through another tab, A's previously invalidated draft must not reappear from a stale provider/router cache. Only appropriately refreshed saved data is shown.
3. **Cross-tab logout:** sign out in tab 2, resume/navigate or try to act in tab 1, and verify protected drafts/forms clear and requests cannot continue under a stale account. Cover returning from a hidden/background state.
4. **Same-user stability:** a benign focus/navigation/session recheck while identity is unchanged preserves dirty drafts, workspace selection, and revision/conflict safeguards. The fix must not become a general draft-discard-on-focus mechanism.
5. **In-flight switch:** hold a disposable A-era request/response, change to B, then release it. Verify its completion does not restore A's UI or corrupt B's drafts/locks/messages. Subsequent B work uses only B's fresh context. Use deterministic isolated interception/fixtures; do not disable authentication or add an application failure endpoint.
6. **Session-check failure:** simulate a temporary verification failure. Stale mutations remain gated with a retry path, no false saved state, and no mistaken account identity. On successful verification of unchanged A, recover the retained A-scoped draft as appropriate; on B/logout, invalidate it.
7. New browser cases pass on desktop and Android-sized/touch emulation. Use two pages in one context for the actual cookie-switch cases; the existing two separate contexts prove different behavior. Application-controlled refresh/navigation is allowed, but test code must not hide the bug by reloading the original tab after switching accounts.
8. Relevant existing checks and the complete browser regression pass, or failures/focused reruns are recorded precisely. Keep real guarded PostgreSQL, owned fixture cleanup, origin/rate/session protections, and memory-only loopback SMTP capture.

Respect the existing auth rate limits when arranging repeated logins; do not weaken them or add blanket test retries to conceal failures. Avoid arbitrary sleeps as proof of synchronization: wait for observable verified-session/UI/request behavior. Do not capture real credentials or account data in logs, traces, broadcasts, or artifacts.

## Documentation and boundaries

- Correct the coordinator history/change inventory to identify `0929f9a` as the committed implementation. The coordinator's preparation of this task already records that correction; preserve it.
- Update the architecture/task completion notes with the actual synchronization strategy, remaining limits, exact tests, and observed behavior. Do not claim this issue is fixed merely because the old suite passes.
- Scope is the session/UI/draft boundary and tests. No schema or data migration is expected. Do not add roles, change membership/registration policy, alter SMTP/provider configuration, build Kanban/calendar features, introduce offline drafts, or deploy to the owner's server.
- Preserve unrelated checkout changes and the owner's independent ignored environment files. All review/fixture mail stays on loopback; no real-provider sends or external account changes.

## Completion handoff

Implemented against `c8fabab` (task 006 preparation, application baseline `0929f9a`) on 2026-11-05. No dependencies, schema/migrations, SMTP/provider settings or membership/registration policy were changed. No server deployment or later planner feature was performed.

### Implementation and contracts

- Added `src/components/planner-session.tsx` and `src/lib/planner-session.ts`: one verified session boundary around the complete protected layout, including header, workspace options/management, and drafts. Better Auth 1.7.18 installed API/types/source were checked: direct `getSession` with disabled cookie cache/no-store is supported; its storage/focus refresh manager requires a mounted session subscription, and the existing application did not have one. The fix uses explicit verification rather than assuming a layout key/client singleton is live.
- Initial/pathname, focus/visible resume, pageshow, auth pulse, and pre-mutation checks verify the current server session. `session-signal.ts` emits only a non-secret invalidation nonce after successful signup/sign-in/sign-out/reset. The Better Auth storage key is also treated only as a hint. No background polling, user identity selection from messages, draft broadcast, or durable draft storage.
- A checking/error boundary hides and makes the protected shell inert without unmounting it. Failed/timed-out verification requests pause editing with Retry session check; only a successful null session confirms logout. Same-user checks preserve drafts, selection, revision/conflict review, and in-flight work. Check versions ignore out-of-order identity responses; a new signal supersedes any old verifier.
- Confirmed account change advances an epoch, aborts protected fetches, clears provider drafts/selection/save locks, allows document exit without the obsolete draft warning, and replaces the document with Projects/sign-in. Header, authorized workspace options, errors/conflicts and forms are refreshed together. Context guards in planning, workspace creation/membership, sign-out and draft setters/completion callbacks ignore obsolete work. Real unmount disposes the old coordinator without allowing it to navigate a replacement boundary; immediate Strict Mode reattachment keeps the same context usable.
- Added shared `session-contract.ts` and server `session-precondition.ts`. Protected UI requests carry `X-Kanbrik-Account`; verified server sessions reject a mismatch with safe 412 / `SESSION_CHANGED`. This also applies to reads and sign-out. It is an optional rejection precondition for existing API clients, never authorization or a client-selected acting user. Cookies, session validity, workspace membership and trusted Origin remain authoritative. Body contracts and data ownership are unchanged.
- Requests verify both before dispatch and after consuming network responses. Account/epoch checks and aborts prevent A-era responses from mutating B's state or releasing B's pending lock. A server transaction authorized before a switch can still commit; cancellation is not rollback. The held-response regression explicitly confirms that distinction.

### Verification evidence

- Before fix: the same-cookie desktop regression against the existing task 005 production build confirmed the shared context was B while tab 1 never acquired B's header (failed the B-header assertion after 5 seconds). Coordinator's prior Board → Projects reproduction remains recorded above. An initial baseline-harness attempt waited for a focus verification that the old implementation did not implement and timed out; the baseline was adjusted to reach the actual account-switch assertion. No passing-old-suite claim substitutes for this reproduction.
- `npm run check`, `npm run db:validate`, default `npm run build` (Turbopack), and `npm run build -- --webpack` passed. Final HTTP/browser verification uses the Webpack build. Historical default-build helper failures remain unexplained; no root-cause fix claimed. No migration is required for task 006.
- Final `npm run test`: **54/54 passed** in four files, including all 53 prior database/HTTP/SMTP/safety checks and a real-session expected-account regression. An A expectation with B's authenticated shared-editor cookie cannot read/update/create content, create a workspace or sign B out (412); saved task text/revision and B's session remain unchanged. Correct expectation permits an authorized edit, while matching outsider/anonymous expectations still fail membership/auth checks (404/401).
- Initial focused browser command `npm run test:e2e -- --grep "same-cookie tabs|session verification failures|obsolete save completion"`: **6/6 passed**, three desktop plus three Pixel 7 cases. Tests use actual form sign-in with two pages in the **same browser context**, owned disposable accounts/shared task, and controlled request/response gates; no test reload of the stale tab. Follow-up assertions add same-user conflict-state retention and lifecycle cleanup coverage to the final run.
- New journeys cover A → B → A without draft resurrection; effective session/header/empty selection; no stale draft write; foreground/background-tab logout; same-user focus/navigation preservation; failed/repeated checks with retry and retained draft; a held obsolete verifier that cannot dispatch A's draft after B appears; and a committed A-era save response released while B has its own held save, retaining B's text/pending lock and producing B's eventual revision 3.
- Development/Strict Mode smoke: `node .local/task006-dev-smoke.mjs` (ignored temporary verification harness) started an isolated Next dev/Webpack server on loopback 3114 with guarded test DB and email recovery disabled, exercised actual signup, navigation/focus with retained draft, task save and sign-out, then stopped only its own process tree and deleted its own fixture. It passed. Next generated a dev route-type reference in `next-env.d.ts`; the subsequent normal type generation restored the production reference, with no tracked file diff. Harness is a local artifact, not a new application command.

Final complete browser result: **30/30 passed in one full `npm run test:e2e` run (6.1 minutes)** against the final Webpack build. All six new same-cookie desktop/Android cases and all 24 existing auth/recovery/planning/conflict/revocation/retry/navigation/keyboard/touch cases passed, with no focused recovery rerun needed. Same-user conflict review remains visible and Save stays blocked after revalidation; the original tab is never reloaded by test code to repair an identity switch. The retry tests intentionally emit sanitized bootstrap-failure server logs and then verify recovery. The initial focused 6/6 result is distinct from this final full-suite evidence.

### Limits and next review

- Independent coordinator review remains the next handoff; this implementer did not spawn a separate reviewer. The reproduced task 005 gap is addressed by implementation plus explicit new regressions and final full-suite evidence, ready for that review.
- Event/action synchronization cannot retract previously downloaded data or run while a browser suspends JavaScript. Notifications may be unavailable; resume/navigation/action verification and server preconditions still apply. Verification-network errors retain the original scoped draft behind a neutral retry screen, not an editable unknown-account form. Aborted responses do not reverse committed work.
- No production/provider mail, Ubuntu/Docker runtime, hardware Android, dependency audit, backup/restore, or deployment check was performed. Existing guarded PostgreSQL and memory-only loopback SMTP fixtures were retained, with no rate-limit bypass or blanket retry changes.
- Proposed next work only after review: separately scoped Kanban over canonical tasks with authorized workspace selection and non-drag controls. It was not started.

### Independent review follow-up

Coordinator review at `0c13917` passed lint/types, schema validation, Webpack build, **54/54** unit/database/HTTP/SMTP checks, and **6/6 focused cross-tab browser cases**. It did not independently rerun the implementation's full 30-case suite. A separate test with A's valid session due for renewal, unavailable auth notification hints, and a held verification response found that its `Set-Cookie` restored A after B signed in; A's obsolete draft then saved at revision 2. Version/epoch checks only protect JavaScript data/callbacks and cannot reverse applied cookie headers. [Task 007](007-read-only-session-verification.md) must make planner verification cookie-immutable and cover both delayed renewal and deletion/expiry paths. The implementation is already committed as `0c13917`; earlier staged/uncommitted descriptions are historical.

Stage only this assignment's changed files and provide a commit message. Leave committing/pushing/deployment to the owner unless explicitly instructed otherwise.
