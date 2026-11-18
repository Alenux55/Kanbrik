# 026 review correction: bound native Calendar event scrolling

Status: Ready for implementation on 2026-11-17. Independent review of the staged 026 candidate above accepted `7d4fa4c` confirmed one P2. Hold import/deployment of 026 until this correction and independent re-review. Accepted 025 remains unchanged. This document assigns the correction, not a later feature.

## Outcome and inputs

Dragging or resizing a saved Calendar event must not auto-scroll the document when the held pointer is outside the Calendar region. Keep useful bounded pane scrolling inside the Calendar, native pre-hold touch scrolling and every accepted gesture/session/save contract.

Read AGENTS.md, README, product/architecture/current handoff, tasks 023/025/026 and this review. Inspect `calendar.tsx`'s FullCalendar configuration, `use-calendar-touch.ts`, `planner-drag.ts` and the native/palette/cancellation regressions. Preserve the original staged coordinator inputs and the current 026 source/tests; no unrelated work is assigned.

## Confirmed P2 and reproduction

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
