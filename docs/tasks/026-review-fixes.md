# 026 review correction: bound native Calendar event scrolling

Status: Original P2 independently closed on 2026-11-18 at clean owner-committed `427ed1d`, reviewed against `0bd6f8d`. No new actionable findings. Task 026 is accepted and its import/deployment hold is lifted. Coordinator checks passed 178 backend and 30 focused browser cases/two intentional Android mouse-only skips; the unchanged original reproduction now shows zero document movement on both profiles. Earlier negative/implementation evidence remains separately recorded below.

## Outcome and inputs

Dragging or resizing a saved Calendar event must not auto-scroll the document when the held pointer is outside the Calendar region. Keep useful bounded pane scrolling inside the Calendar, native pre-hold touch scrolling and every accepted gesture/session/save contract.

Read AGENTS.md, README, product/architecture/current handoff, tasks 023/025/026 and this review. Inspect `calendar.tsx`'s FullCalendar configuration, `use-calendar-touch.ts`, `planner-drag.ts` and the native/palette/cancellation regressions. Preserve the original staged coordinator inputs and the current 026 source/tests; no unrelated work is assigned.

## Original confirmed P2 and reproduction (closed)

The new bounded-scroll implementation is in the custom `PlannerSensor`, which handles Projects, Board and Calendar palette gestures. Saved Calendar events still use FullCalendar's native interaction auto-scroller. The installed interaction code defaults its scroll targets to `[window, '.fc-scroller']`; the Calendar configuration enables native touch gestures without restricting that default. `eventAllow` guards eligibility, not the native auto-scroller's window target.

Independent ignored `.local/review026-native-boundary.mjs` reproduced this against the reviewed build on owned loopback app 3115, using generated disposable accounts/blocks and genuine Chromium/CDP touch events for Pixel 7:

1. Open a Day grid with a 13:00–14:00 saved block; scroll the document/grid until the block is visible.
2. Start a native saved-event drag (mouse press/move or Android 400 ms hold/move) and verify its mirror is visible.
3. Move to viewport `(5, 5)`, explicitly verified outside `[data-calendar-gesture-region]`, and hold stationary for 850 ms.
4. Desktop document scroll changes **471 → 266**; Android emulation changes **1140 → 935**. Both auto-scroll the page upward **205 px** despite the pointer being outside Calendar.
5. Escape/cancel leaves **zero PATCH writes and block revision 1** in both profiles. This finding concerns unwanted page movement, not an observed data mutation or ownership violation.

The probe removed only its generated fixture accounts/workspaces/blocks and stopped its owned app. It emits sanitized flags/geometry/counts only, with no credentials/cookies/trace/video. Existing green native gesture tests do not assert the outside-pointer window-scroll case; the palette boundary regression exercises a different scroll engine.

## Scope and boundaries

- Bound the native saved-event move/resize scroll engine as well as the palette engine. Do not rely on `PlannerSensor` or drop-validity checks alone to control FullCalendar's internal window scrolling.
- Prefer supported public configuration and a shared bounded scrolling implementation if needed. Do not patch node_modules or couple correctness to undocumented mutable calendar internals. Do not introduce another drag/calendar library.
- Preserve stationary-pointer scrolling inside the intended Calendar pane, native touch swiping before activation, selected-event resize handles, correct hit testing/intervals and the compact preview. Merely disabling all scrolling without an inside-pane replacement does not meet the original task.
- Stop scrolling immediately on leave, release/cancel, modal/session failure, scope/range/filter/access/account change and interrupted grid replacement. A stale native callback cannot resume scrolling, commit a change or reopen an editor.
- Preserve 025's stable grid/scroll during ordinary saves and content concealment during uncertainty. Keep one write on a valid release, zero hover/no-op/cancel writes, DST/elapsed duration, revisions/receipts, selection boundaries, retained drafts and explicit controls. No schema, API, dependency, environment or deployment change is expected.

## Acceptance and verification

1. Add a genuine desktop/Pixel 7 touch regression for a held **saved event** with the pointer outside the Calendar. Assert both window scroll axes stay unchanged during a stationary interval and document dimensions do not grow. Cover move and resize, top/bottom/side edges and cancellation; do not substitute a palette card or a mouse-only mobile viewport.
2. Confirm actual bounded inside-pane scrolling still moves the visible time range while the pointer is held, yields the correct final interval and stops on cancellation/leave. Keep palette boundary and first/last sibling/Board scrolling coverage.
3. Re-run the independent native-boundary probe or an equivalent reviewer-owned reproduction on both profiles. Record before/after scroll geometry, zero canceled writes and unchanged saved revision. Include pending hold, selected event, second-finger and modal/session/range/account interruption cases.
4. Run README lint/types/build, complete backend checks and affected native/palette Calendar, touch/cancellation, order, stable-save, session and tag-recovery browser regressions. Run the complete integrated browser suite after correction; distinguish all attempts and skips accurately. Physical Android remains a separate limitation unless actually checked.

## Completion handoff

Record the final approach, exact source/test checks, results, earlier failures and limits here and in 026/current handoff. Stage task-owned corrections and return for independent re-review before owner integration/deployment. Do not mark the original P2 closed solely from the implementer's passing regression. No runtime correction, commit, push or deployment was performed by this review.

## Independent correction review — 2026-11-18

Reviewed clean owner-committed `427ed1d` against `0bd6f8d`. No new actionable findings; the original P2 is closed and task 026 is accepted. Public FullCalendar native-scroll disablement, the shared bounded pane step, movement-qualified/current-generation native callbacks and retained gesture/session/save contracts meet the correction scope. No runtime or test edit was made by the coordinator.

After the independent Webpack build, the **unchanged** reviewer-owned command `node .local/review026-native-boundary.mjs` observed desktop document scroll **471 → 471** and Pixel 7 **1140 → 1140**, pointer explicitly outside Calendar for the original stationary interval. Both recorded zero PATCH writes and block revision 1. This is direct independent closure evidence, separate from implementer probe results. Its generated local accounts/workspaces/blocks were removed and owned app 3115 stopped; no credentials/cookies/trace/video or populated auth screenshots were recorded.

Independent `npm run check`, `npm run db:validate`, guarded migration status (**16 applied, none pending**) and `npm run build -- --webpack` passed. Full backend/unit verification passed **178/178 across 20 files**, exit 0:

```powershell
node .local/task014-command.mjs integration --reporter=json --outputFile=.local/coordinator-review026-fix-tests.json
```

Independent affected browser verification passed **30 cases / zero failures / two intentional Android mouse-only skips, 32 total, 7.8 minutes, exit 0**:

```powershell
node .local/task014-command.mjs browser native-scroll-boundary.spec.ts touch-gestures.spec.ts drag-cancellation.spec.ts stable-save-feedback.spec.ts calendar-gesture-review.spec.ts tag-recovery.spec.ts --grep 'saved-event|native scroll frames|Projects whole-row|Board genuine|Calendar palette hold previews|Saved Calendar events|Projects edge scrolling|hold retires on a range|account switch retires|held Calendar save|real Calendar drops|Board 503 recovery'
```

All ten added native boundary scenarios passed without skips on desktop/Pixel 7, including move/resize outside each edge, useful inside-pane scrolling/exact saved interval and interruption/obsolete-release guards. Existing whole-row sibling preview, Board/palette touch and scrolling, native pre-hold move/resize/cancel, context/account retirement, 025 stable-save geometry and desktop Board 503 recovery passed. The two skips are historical real-mouse native-gesture/tag-recovery cases on Android, not the new touch tests.

Inspected the supplied final complete-browser log: **236 passes / 14 intentional skips, 250 total, 54.5 minutes**. That is carried implementer evidence; no new coordinator complete suite is claimed. Physical Android, other engines/screen readers, Ubuntu/proxy/TLS/provider, fresh install/audit/container/default bundler and actual deployment/production restore remain unverified. The inspected ignored process-only 15432 adapter leaves saved environments unchanged; README npm test/test:e2e equivalents take the same arguments. No schema/dependency/API change required a new migration/preservation proof; all 16 existing migrations remain required. Review app/SMTP/database listeners are closed and the owned main test database was stopped after port verification. Documentation only is updated/staged; no commit, push or server/provider action was performed.

## Correction handoff — 2026-11-18

Implemented this P2 only above the clean owner-committed feature/review baseline **`0bd6f8d`**. Accepted 025 remains `7d4fa4c`. No package/lockfile, API, schema/migration, environment, server/provider or deployment change. All 16 existing migrations remain required. The five changed source/test files match the final tested hashes; all task-owned corrections/documentation are staged. No commit or push performed.

### Approach

FullCalendar v6's supported `dragScroll=false` disables its native window/pane auto-scroller for saved-event move and resize. The existing custom step is extracted to `src/lib/planner-scroll.ts`, preserving Projects/Board/palette rules. Native events share that step with a stricter mode: only a scrollable `.fc-scroller` under the current Calendar root is eligible; there is no document fallback. The held point must remain inside its visible pane bounds, the press must have physically moved, and the existing ready/context/session lifetime must still own it. Release, cancellation, leave and interrupted replacement stop further steps. No private mutable calendar internals or node_modules patches are used.

Native callbacks also require physical movement from their own current press, using weak event-to-press references plus the existing generation lease. Intermediate tests observed a 15-minute move from a stationary selection hold; those callbacks now revert without saving. A stationary hold can expose selected resize handles, while genuine move/resize still saves once. Existing duration/DST, revision/receipt, assignment, explicit control and account checks remain. Ordinary completed saves retain 025's mounted grid and scroll/concealment protections.

### Actual verification

| Check | Result |
| --- | --- |
| `npm run check` | Lint and strict types passed; `.local/task026-fix-check.log`. |
| `npm run build -- --webpack` | Passed on the final runtime; `.local/task026-fix-build.log`. |
| `npm run db:validate` and guarded Prisma migration status | Valid schema; **16 applied migrations, none pending**; `.local/task026-fix-schema.log`, `.local/task026-fix-migrations.log`. |
| Complete backend/unit suite | **178/178 across 20 files, 31.39 seconds, exit 0**; `.local/task026-fix-full-backend.log`. |
| Complete integrated browser suite | **236 passed / zero failed / 14 intentional Android mouse-only skips, 250 cases across 34 files, 54.5 minutes, exit 0**; `.local/task026-fix-full-browser.log`. All **125 desktop** and **111 applicable Pixel 7** cases passed, including all ten new native-scroll cases without new skips. |
| Unchanged reviewer probe rerun by implementer | **Desktop 471 → 471; Pixel 7 1140 → 1140**, outside Calendar, zero PATCH writes and revision 1; `.local/task026-fix-final-probe.log`. This is not independent re-review. |

Commands follow README, with this checkout's existing ignored process-only adapter: `node .local/task014-command.mjs integration`, `browser`, and `node_modules/prisma/build/index.js migrate status`. The guarded test URL uses loopback **15432** because saved **55432** is Windows-reserved; saved `.env`/credentials remain unchanged. The unchanged isolated probe is `node .local/review026-native-boundary.mjs`; it creates/deletes only generated fixture accounts/workspaces/blocks and closes its owned app.

The new cases use a real desktop mouse and actual Chromium/CDP Pixel 7 touch start/move/end/cancel events. Both move and resize assert stationary outside top/bottom/side holds preserve both document scroll axes, pane positions and document dimensions. Positive cases prove actual inside-pane scrolling, unchanged window position, correct snapped final interval/duration, zero hover writes and one valid release write. Pending holds, selected-event resize, second fingers, modal, range, failed session and account changes retain zero canceled writes and original revision; subsequent obsolete releases cannot resume scrolling or save. The complete run also includes existing palette boundaries, sibling/Board scrolling/order, Calendar/DST/recovery, stable-save/session and tag-recovery cases.

### Earlier evidence and corrections

Before correction, the unchanged reviewer probe reproduced desktop **471 → 266 (-205 px)** and Pixel 7 **1139 → 932 (-207 px)**, zero writes/revision 1 (`.local/task026-fix-baseline.log`). Those are negative baseline observations, not passing boundaries. The first and second native selections each finished **six passes/four failures, 5.1 minutes** (`.local/task026-fix-first-native.log`, `.local/task026-fix-second-native.log`). The third finished **eight passes/two failures, 2.8 minutes** (`.local/task026-fix-third-native.log`): all move/resize cases passed; range checks were snapshotting temporary loading geometry. The corrected interruption selection then passed **2/2, no skips, 52.7 seconds**, exit 0 (`.local/task026-fix-fourth-interruptions.log`). All ten passed freshly in the final complete run above.

Corrections include the movement-qualified native save guard, waiting for authorized range reads before measuring stationary post-interruption geometry, honoring installed v6's 500 ms compatibility-mouse delay after touch, and releasing an already interrupted press without sending Escape into the newly opened modal. Relevant zero-scroll/no-write/revision/interval assertions remain intact. One intermediate type-only failure in the retained end-event movement shape was corrected before the final passing check/build. No earlier red selection is claimed green.

### Limits, cleanup and next step

Touch evidence is genuine Chromium Pixel 7 emulation, **not physical Android**. Other engines/screen readers, Ubuntu/proxy/TLS/provider operation, fresh install/audit/container/default-bundler, deployment and production restore remain unverified. No authentication screenshots/traces/videos were captured. The task-owned portable database is stopped and application/SMTP/database listeners are closed on **3100–3126 and 15432/15434/15435**. No production server or provider was touched.

Return this staged correction for **independent coordinator re-review**. Passing implementer tests and the unchanged probe do not independently close the P2; keep import/deployment on hold until re-review. Proposed commit message: **fix: bound native Calendar drag and resize scrolling**.
