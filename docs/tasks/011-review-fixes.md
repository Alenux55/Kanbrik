# Task 011: coordinator review corrections

Status: Ready for corrective implementation. Review baseline `a621e0f`; reviewed on 2026-11-09. This file assigns corrections to the delivered planner redesign, not another implementation of slices A–E.

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

This evidence is from the completed review, not a fresh application test run for this documentation-only handoff. No real server/proxy/provider or physical Android checks were performed.

## Verification and completion handoff

1. Reproduce both P2 findings against the reviewed baseline and record actual results. Keep fixture credentials, session tokens, generated output and local databases out of Git.
2. Implement only these corrections and meaningful history/retry regressions. No schema, dependency or API change is expected. Preserve unrelated checkout changes.
3. Run README lint/types/build checks, the targeted dialog/history and desktop overflow regressions, and relevant pending/dirty/account-boundary cases on both profiles. Then run the final integrated browser suite; report exact pass/fail/skip counts. Run backend checks if changed behavior warrants them and distinguish carried evidence from new runs.
4. Update this record, the implementation handoff and main handoff with the corrected behavior, final commands/results and limitations. Leave independent re-review pending; do not mark task 011 accepted just because the patches are written.
5. Stage task-owned changes and provide a commit message. The owner commits/pushes; no deployment is authorized by this assignment.

Boundaries: no further usability features, capture/checklists, time-zone policy changes, data moves, auth-policy changes, custom statuses, new dependencies, offline editing or server/proxy configuration.
