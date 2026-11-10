# Task 011: coordinator review corrections

Status: Corrections committed as `75f678e` and independently re-reviewed on 2026-11-09 without actionable findings. Both original P2 findings are closed. Review baseline `a621e0f`; correction base `84037c2`, preserving reviewed task 012 invitations. This file records corrections to the delivered planner redesign, not another implementation of slices A–E.

## Outcome and inputs

Fix the shared editor's browser-history handling and make the Calendar overflow regression's session-retry action reliable. Preserve task 011's delivered UI, canonical data and account/workspace safeguards. Return a completion handoff for independent re-review before assigning another feature.

Read `AGENTS.md`, [architecture.md](../architecture.md), [011 design](011-planner-usability.md), [011 implementation record](011-implementation.md) and [coordinator handoff](../handoff.md). All redesign slices are already implemented at `a621e0f`. Owner-approved workspace settings defaults and the user-local/workspace-reference time model remain in place.

## Findings and scope

### P2: editor closure leaves phantom browser-history entries

Location: `src/components/ui/editor-dialog.tsx`, especially the mount-time `pushState` and cleanup at lines 80–83 of the reviewed commit.

- Opening an editor pushes a same-URL history entry. Closing with Close/Cancel/Save currently removes the `kanbrikDialog` marker using `replaceState`, leaving the synthetic entry in the stack.
- Independently reproduced: navigate Projects → Board, open a saved task's clean editor, close it, then press Back. The first Back stays on Board; only the second reaches Projects. History length rose from 3 to 4 after opening/closing. Repeated editors accumulate unwanted navigation steps.
- Reconcile/remove the dialog-owned entry on ordinary closure without moving back twice when closure was itself caused by Back. Preserve Next routing state and real navigations. Do not use broad history resets, page reloads, or route-cache workarounds that discard drafts.
- Preserve dirty-close confirmation, pending-save dismissal guards, focus restoration and account/lease checks. Include native Back handling and successful save/keep-draft paths in the chosen history contract.

Acceptance: after Projects → Board → clean open/close, one Back reaches Projects. Repeated open/close cycles do not add phantom steps. Back while a dialog is open closes/asks about that dialog first; dirty input survives Keep editing, and pending saves cannot be accidentally dismissed. Verify desktop and Android emulation with real history navigation, not just dialog disappearance.

### P2: overflow regression's immediate Retry click is swallowed

Location: `tests/e2e/011-overflow.spec.ts`, lines 65–71 of the reviewed commit.

- The independent full browser run failed this case at the final `expect(palette).toBeVisible()`. The palette dimensions were stable: before/during width 254, height 648, document width 1440. The failure was session recovery after an intentionally injected identity-check error, not renewed scrollbar growth.
- After ending the active mouse drag, the test immediately clicks Retry session check. dnd-kit's transient post-drag click suppression can consume that click. Independent reproduction observed **zero** `/api/planner-session` requests after the mouse click; deliberate keyboard activation of the same button recovered normally.
- Make the fixture perform a reliable supported activation, such as focusing Retry and pressing Space/Enter, or synchronizing with actual drag cleanup. Avoid an arbitrary long sleep, force-click, skipped assertion, disabled identity check, or weakened app security. Keep the real pointer drag, bounds assertions, hidden portal check and zero-unintended-writes assertion.

Acceptance: the focused desktop overflow case passes through error → Retry → ready with a verified request actually dispatched. Its Android skip remains justified because that specific palette gesture is mouse-only; retain the separate Android touch/scheduling coverage. The full integrated suite must have no unexpected failure after the correction.

### P3: coordinator handoff did not reflect implementation

The reviewed main `docs/handoff.md` described task 011 as documentation-only and suggested implementing slice A, despite all slices being committed. **This documentation preparation corrects that status and links the completion/review records.** Preserve these corrections and update the latest commit, actual commands/results and next action after implementing the two P2 fixes. Do not replace history with invented passes or claim the coordinator approved its own requested corrections in advance.

## Independent review evidence carried forward

The coordinator checked `a621e0f` and left tracked files unchanged during the review:

- `npm run check`: lint/types passed.
- `npm run db:validate`: passed.
- `npm run db:test:migrate`: six migrations found, no pending migrations.
- `npm run build -- --webpack`: passed.
- `npm run test`: **85/85** passed across seven files.
- `npm run test:e2e`: **60 passed, 1 failed, 1 intentional Android skip** out of 62 cases in **14.2 minutes**, exit 1. The sole failure was the overflow test's Retry step described above. This is not a full pass; it differs from the implementer's earlier 61-pass/one-skip run.
- Disposable-account Chromium reproduction confirmed the extra Back step and the swallowed Retry click; keyboard Retry recovered. Inspected the fresh Board/Projects UI, confirming the sidebar selector, User settings, compact cards, hierarchy and overlays exist in this commit.
- The owner reported Ubuntu `HEAD`/`origin/main` at `a621e0f`. The coordinator did not inspect the live HTTPS instance or verify its running build/process. A production-mode `npm run start` serves the built app: after pulling, apply migrations, rebuild, stop the old process and start the new build using the README procedure. Correct Git HEAD alone does not establish which build is running.

The evidence above was carried forward from the completed review into `fa0923e`'s documentation-only preparation. New corrective implementation checks are recorded below, separately. No real server/proxy/provider or physical Android checks were performed by that review.

## Verification and completion handoff

1. Reproduce both P2 findings against the reviewed baseline and record actual results. Keep fixture credentials, session tokens, generated output and local databases out of Git.
2. Implement only these corrections and meaningful history/retry regressions. No schema, dependency or API change is expected. Preserve unrelated checkout changes.
3. Run README lint/types/build checks, the targeted dialog/history and desktop overflow regressions, and relevant pending/dirty/account-boundary cases on both profiles. Then run the final integrated browser suite; report exact pass/fail/skip counts. Run backend checks if changed behavior warrants them and distinguish carried evidence from new runs.
4. Update this record, the implementation handoff and main handoff with the corrected behavior, final commands/results and limitations. Leave independent re-review pending; do not mark task 011 accepted just because the patches are written.
5. Stage task-owned changes and provide a commit message. The owner commits/pushes; no deployment is authorized by this assignment.

Boundaries: no further usability features, capture/checklists, time-zone policy changes, data moves, auth-policy changes, custom statuses, new dependencies, offline editing or server/proxy configuration.

## Correction completion — 2026-11-09

### Reproduction before the patch

The checked-out application at `84037c2` retains both reviewed defects. Built it with `npm run build -- --webpack`, then ran `npm run test:e2e -- --project=desktop --grep 'ordinary editor closure|palette drag keeps'` against unchanged runtime code. Both cases failed as expected:

- Three editor open/close cycles increased history length **3 → 6**; one real Back stayed on Board rather than reaching Projects.
- Palette dimensions stayed **254 × 648**, with document width **1,440**, before/during the real mouse drag. The final Retry mouse activation left the session gate active and the palette hidden.

### Delivered correction

- Shared dialog history has one same-URL owned slot. Ordinary Close/Cancel/Escape, successful save and Keep draft closure consume it with one asynchronous Back traversal. Native Back has already consumed the slot and causes no second Back. Dirty/pending/session-gated Back restores the existing slot with Forward instead of pushing duplicates.
- A small history owner coordinates asynchronous traversal, immediate editor replacement and React effect replay. Cleanup is deferred one microtask so a replacement can reuse the slot; a later mount waits for in-progress traversal. Every traversal/response remains account-lease guarded. Route state is copied intact; real route entries are not rewritten, and the implementation adds no reload/cache workaround.
- Browser history can retain one consumed slot in the Forward direction; reopening prunes/reuses it. It does not accumulate behind the active route, and one Back after ordinary closure reaches the previous route. This is a browser history reconciliation contract, not a claim that history.length shrinks after Back.
- Overflow Retry focuses the supported button and presses Space with a 75 ms key hold (the pinned dnd-kit sensor removes its click capture after 50 ms; the existing Board fixture uses the same key duration). It waits for an actual GET `/api/planner-session` response with status 200 and retains all pointer bounds, hidden-preview, ready-state and zero-unintended-block-write assertions. This adds no arbitrary long sleep or forced click. The intentional mouse-only Android skip is unchanged.
- New desktop/Android history regressions exercise repeated Close/Cancel/Escape, native Back/Forward, dirty Keep editing/Discard, retained input through route navigation, successful saves, pending-save Back, focus restoration and one-write assertions.

### Actual verification

- Initial correction focus run: **six history cases passed**, one Retry case failed, one intentional Android skip (eight total). Zero-duration Space was still swallowed during the sensor's 50 ms document click capture; the bounded key duration above corrects that fixture activation. A successful probe remains mandatory.
- `npm test`: **94/94 passed across nine files** on the corrected runtime (no backend source changed), including the reviewed invitation/auth/database regressions.
- `npm run check`, `npm run db:validate`, `npm run db:test:migrate`: passed on the final candidate; seven migrations, none pending. No migration/reset was needed. Both `npm run build` (Turbopack) and `npm run build -- --webpack` passed. Browser verification uses the final Webpack build.
- Local development/Strict Mode smoke: passed using an ignored loopback-only harness on port 3114, guarded test database and disposable account/task. Three repeated editor closures left history **3 → 4** (one reusable Forward slot), then one Back reached Projects. The fixture account and its records were removed; the owned development server was stopped. No development fixture was written to the app database.
- Final focused `npm run test:e2e -- dialog-history.spec.ts 011-overflow.spec.ts`: **seven passed / one intentional Android skip**, eight cases in 2.0 minutes, exit 0. Both desktop/Android history suites pass; the desktop Retry emits a successful probe and returns to ready without a block write. History **3 → 4** remains bounded across repeated closures.
- First integrated `npm run test:e2e`: **68 passed / one failed / one intentional skip**, 70 cases in 16.1 minutes. All history/Retry, account-boundary and invitation cases passed. The desktop consecutive Calendar drag fixture attempted its second raw-coordinate drop before observing the first assignment's client acknowledgement/history reconciliation. It now waits for the saved UI, actual dialog removal, consumed owned marker and ready view, verifies the assigned event label, then measures fresh visible targets. Shared close/save/retain helpers use the same completion barrier. No Calendar application behavior or assertion was removed.
- Focused Calendar rerun after that fixture refinement: **2/2 passed** on desktop/Android in 49.6 seconds. Final `npm run check` also passed with the updated test helpers.
- Final integrated `npm run test:e2e` after that fixture refinement: **69 passed / zero failures / one intentional Android skip**, 70 cases in **15.8 minutes**, exit 0. This is one complete run on the final Webpack application and final browser fixtures, including all six new history cases and the reviewed invitation/auth/session/Board/Calendar regressions. The skipped palette case is desktop-mouse-only; separate Android touch and scheduling workflows passed.
- `git diff --cached --check`: passed. Task-owned source/tests/docs are staged; generated output, `.env` files and the local smoke harness remain ignored.

No schema, dependency or API change, production/provider action, commit or push. Physical Android remains unavailable; mobile verification uses Pixel 7 emulation. Existing task 012 approval is carried forward, not claimed as review of these changes.

## Independent correction re-review — 2026-11-09

Reviewed owner-committed `75f678e` against `84037c2`. No actionable defects found; both original P2 findings are closed. The dialog now consumes its own entry on ordinary closure/save/retention, restores the existing entry on blocked Back and avoids a second traversal after native Back closure. The Retry correction retains the real drag, stable bounds, hidden portal and zero-write assertions and requires a successful identity probe. Calendar/helper changes wait for actual UI/history completion before measuring another gesture target. Task 012 source and its access policy are preserved.

Independent verification on the Windows checkout:

- `npm run check`, `npm run db:validate`: passed. `npm run db:test:migrate`: seven migrations, none pending on the guarded loopback test database. The first restricted migration invocation could not run the schema engine; the same documented command passed outside that process sandbox.
- `npm run build -- --webpack`: passed on the reviewed source.
- `npm run test -- --reporter=json --outputFile=.local/review011-correction-tests.json`: **94/94 tests passed**, zero failures/skips across nine files; saved report is ignored local output.
- `npm run test:e2e -- --grep 'ordinary editor closure|dirty Back|Back during a pending|palette drag keeps|work drops distinguish|same-cookie tabs|session verification failures|obsolete save completion|administrator emails'`: **17 passed / zero failures / one intentional Android skip**, 18 selected cases in **4.2 minutes**, exit 0. Covers all six new history cases, desktop post-drag Retry with a verified response, consecutive Calendar gestures, cross-account/session failures and obsolete saves, and invitation signup on desktop/Pixel 7 emulation. Repeated close history stayed **3 → 4**, with one Back reaching Projects. The skip remains the mouse-only palette case.
- A separate ignored Chromium harness exercised the actual TypeScript history helper in an isolated same-origin page: effect replay, same-commit editor replacement, replacement during an in-progress traversal, and release during blocked-Back restoration all passed. Each preserved route state, kept at most one reusable Forward slot and returned to the previous route with one Back. This isolates the helper; it does not claim another full React development-mode run.
- `git diff --check 84037c2 75f678e`: passed. Application, tests, dependencies and schema were left unchanged during review; only review/handoff documents are updated.

The implementer's final integrated **69 passed / zero failures / one intentional skip** in 15.8 minutes is carried forward, not independently repeated. The coordinator did not repeat the default Turbopack build or development-mode React smoke. Physical Android, Ubuntu/container runtime, real TLS/proxy/Mailcow and deployment remain unverified here. No external messages, server changes, commit, push or deployment were performed by this review. The correction is suitable as the baseline for the next separately assigned feature.
