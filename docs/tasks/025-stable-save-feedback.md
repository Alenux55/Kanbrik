# 025: Stable planner layout during saves and verification

Status: Independently accepted on 2026-11-16 at clean owner-committed `7d4fa4c`, against `125858e`/accepted runtime `499cfd3`. No actionable findings. Coordinator checks passed 172 backend and 30 focused browser cases/two intentional Android mouse-only skips. The implementer's complete-browser pass remains separately attributed below. Task 026 remains unimplemented and is ready for a separate assignment.

Suggested model: GPT-6.1 Sol, High effort; this touches the shared session boundary. This is a recommendation, not agent configuration.

## Outcome and inputs

Calendar create/drop/move/resize/remove and ordinary edits should not feel like a page reload: preserve the user's position, grid geometry and surrounding controls through a same-account save. Keep truthful pending/failed feedback and all existing account isolation. Read AGENTS.md, README, product/architecture/current handoff, tasks 006/007/011/014/017/022/023 and the session/recovery regressions.

Inspect `src/lib/planner-session.ts`, `src/components/planner-session.tsx`, `planning-drafts.tsx`, `calendar.tsx`, `board.tsx`, `planner-context.tsx`, block/entity editors and supplemental mutations. The accepted authentication P1 fix (024) is a separate contract and must stay intact.

## Observed source behavior and limits

- `PlannerSession.fetch` calls `verify(true)` before mutations. This sets the shared phase to checking. `PlannerSessionBoundary` then sets the complete protected subtree hidden/inert and renders a replacement checking page. This collapses the planner's layout even during normal same-account edits; it is a strong source-supported explanation for the owner's reload-like flash.
- The same fetch consumes its response before post-response identity verification. A successful `finishSave` also increments `saveEpoch`, causing current views to reload authoritative data. Calendar already reconciles the returned block locally before that refresh. Those refreshes are distinct from document navigation.
- Ordinary successful Calendar mutation code does not call a document reload. `window.location.replace` is intentionally used for account/logout changes. Confirm the actual desktop/mobile sequence with instrumentation before calling the visual symptom a literal reload.
- The precise highlighting cause is not yet reproduced; 026 owns that investigation. This task must not silently change drag semantics while fixing the shared save presentation.

## Scope

### Preserve geometry and position

- Reproduce create by drop, native event move/resize and explicit editor saves. Record document navigation requests, protected subtree/layout changes, document scroll, Calendar internal scroll, day/view/scope, focus and pending indicators before/during/after. Use generated data; never log cookies, credentials or token URLs.
- Remove full-page replacement/layout collapse from the routine same-account save experience. Prefer a stable mounted shell and geometrically stable protected placeholders/veil during required blocking verification, plus local Saving feedback. Protected content must still be hidden and inert whenever the current identity is uncertain. A placeholder must expose no protected text, accessible name, tooltip, link, preview or live region.
- Keep document/grid scroll and selected date/view/scope stable when the user has not changed them. Preserve the FullCalendar instance/geometry where practical, existing dialogs/drafts/disclosures and focus; avoid hide/show size-zero remeasurement that resets the visible schedule. Do not keep sensitive portals outside the gate.
- Initial load, genuine account change, logout, session error and explicit navigation may still require their established gate/navigation. A same-account routine save must not reset the page to the top, replace the navigation shell or remount unrelated editor/filter providers.

### Authoritative updates and honest recovery

- Reconcile the acknowledged Calendar mutation using the canonical returned record; update/remove only the affected reservation and counts/filter membership. Retain an authoritative refresh for collaborators/metadata when needed, with stable layout. Do not turn background refresh into a global empty/loading reset or a second mutation.
- Preserve saveEpoch/account-bound invalidation when an editor/view unmounts before a confirmed save. A successful save can become visible in another current view; it must not clear another draft, release another lock or resume an obsolete gesture.
- Failed/uncertain/conflicting mutations remain visibly unsaved, with the original revision/request key and explicit reconciliation. A failed refresh is distinct from a failed mutation; an already confirmed save must not be described as an uncommitted request simply because a later read failed.
- Avoid gratuitous repeated loading announcements. Pending controls remain blocked against duplicate submission, and success/failure remain accessible. Maintain stable focus after a deliberate save/close.

### Session and authorization invariants

- Preserve before-dispatch and after-body identity verification, expected-account headers, server membership/Origin enforcement, epoch/lease/generation checks, obsolete completion rejection and invalidation/abort behavior. Do not remove verification, cache identity to skip checks, trust client user IDs or leave old-account content visible during uncertainty just to eliminate a flash.
- A genuine verification failure, storage/focus/pageshow account signal, 401/412 or cookie switch must still hide protected content/portals and pause edits until verified. Account A data/input must never appear in account B or a signed-out document. Session Retry must remain reachable; pending native modal dialogs cannot cover it.
- If shared boundary/request code changes, test overlapping reads/mutations and obsolete verification replies: a late same-account read must not lift a newer failure/account gate or release a pending mutation. Preserve existing invalidation ownership rather than adding a second session coordinator.

## Acceptance criteria and verification

1. Desktop and Pixel 7: create/drop, move, resize, explicit edit and Remove preserve document/grid scroll, day/view/scope and stable shell geometry. Instrument no new document navigation for ordinary same-account saves; capture a genuinely held request, not only its completed state.
2. Same-account saves show bounded local pending feedback without a full-page replacement. During identity uncertainty, protected content remains inaccessible and visually concealed while layout stays stable. Verify focus and document dimensions through the actual gate interval.
3. Exercise delayed preflight, held response body/post-check, failed verification/Retry, 503, 409 and lost response; retain original intents and one actual committed mutation. Failed background refresh must not recreate deleted events or present a false empty schedule.
4. Same-cookie multi-tab account switch/logout, pending save during account change, obsolete probes/completions, revoked workspace and open task/comment/list/block/tag/order drafts retain all reviewed protections. Include portals and native dialogs in the assertions.
5. Run README lint/types/build and meaningful shared-session/backend/browser tests, including `session-isolation`, `dialog-history`, `calendar`, `calendar-gesture-review`, `calendar-drop-preview`, `calendar-presentation`, `compact-filters`, `tag-recovery` and relevant Trash/recovery coverage. Add targeted held-request layout/scroll assertions; do not replace identity assertions with visual-only checks. Run the full integrated suites and report separate results accurately.

## Handoff and boundaries

No schema/migration/dependency change is expected, and no new auth stack, offline queue, polling/push service or deployment is assigned. 026 owns long-press dragging, selection suppression, row controls and sortable previews. Keep source/proofs, actual counts/skips and device limits in this task; update implemented docs only after verification. Stage task-owned changes and return for independent review. Owner commits/pushes/deploys.


## Independent review — 2026-11-16

Reviewed clean owner-committed `7d4fa4c` against `125858e`, including the preserved planning inputs. No actionable findings. Source review covered the mounted aria-hidden/inert/visibility gate and portals, before-paint native-dialog pause/resume, source/input focus and inner-scroll restoration, Calendar feedback/recovery ownership, confirmation pointer handling and the failed-gate/late-response guards. Preflight/post-body checks, expected-account/epoch/lease/abort protections and canonical save refresh remain intact. No runtime or test correction was made by the coordinator. Task 025 is accepted; 026's prerequisite review is satisfied.

Independent `npm run check`, `npm run db:validate`, guarded Prisma migration status (**16 applied, none pending**) and `npm run build -- --webpack` passed. After the build completed, full backend/unit verification passed **172/172 across 19 files**, exit 0, including all five added session ownership cases:

```powershell
node .local/task014-command.mjs integration --reporter=json --outputFile=.local/coordinator-review025-tests.json
```

Independent affected browser verification passed **30 cases / zero failures / two intentional Android mouse-only skips, 32 total, 7.3 minutes, exit 0**:

```powershell
node .local/task014-command.mjs browser stable-save-feedback.spec.ts session-isolation.spec.ts dialog-history.spec.ts trash-navigation.spec.ts activity.spec.ts tag-removal.spec.ts calendar.spec.ts tag-recovery.spec.ts --grep 'held Calendar save|confirmed create and Remove|real drop, native move|failed verification conceals|same-cookie tabs|session verification failures|obsolete save completion|Back during a pending save|ordinary editor closure|clean and dirty work-editor|record-unavailable recovery|failed session checks retain|Trash activity stays|Settings removal exports|calendar overlays retain|Board 503 recovery'
```

All applicable new stable-save scenarios passed on desktop/Pixel 7. These assert genuinely held preflight/body/post-check, protected concealment, retained grid identity/geometry and document/grid/dialog scroll, one actual mutation/no document navigation, confirmed creation/removal despite failed/obsolete refresh, and failed verification/Retry with restored input/focus. Existing account-isolation, ordinary/pending Back, uncertainty/conflict, notification dismissal, tag recovery/removal and direct Trash-recovery cases passed. The skips are the real-mouse stable-gesture and Board 503 recovery cases on Android; explicit/touch cases passed.

Inspected the supplied `.local/task025-corrected-full-browser.log`: its final result is **206 passes / 14 intentional skips, 220 total, 50.7 minutes**. This is carried implementer evidence, not a coordinator full-suite rerun. Earlier failures and corrections remain distinct. Supplied/regenerated Light/System-dark held-gate, failed-check and resumed-draft captures were inspected for concealment, containment and retained focus/scroll. Physical Android, other engines/screen readers, Ubuntu/proxy/TLS/provider, install/audit/container/default bundler and actual deployment/production restore remain unverified.

The inspected ignored adapter uses guarded loopback 15432 process URLs; README npm test/test:e2e equivalents take the same arguments. Saved environment files/credentials are unchanged. No schema/migration/dependency change required a new preservation proof; all 16 existing migrations still apply. The owned database was stopped after port verification and no review app/SMTP/database listeners remain. Documentation only is updated/staged; no commit, push or server/provider action was performed. The content-free verification cover remains intentional; the accepted improvement is stable geometry/position and safe same-account recovery, not an identity-check bypass.

## Implementation record — 2026-11-16

### Delivered behavior and preserved boundaries

The protected planner stays mounted during blocking verification, with aria-hidden/inert plus enforced descendant/pseudo-element visibility concealment. A fixed neutral veil and generic checking/error/Retry panel contain no account/work content. Fixed previews/portals remain inside the protected gate. Calendar/document geometry stays measurable, with no size-zero FullCalendar remeasurement. The normal save path still performs the original pre-dispatch and post-body server probes; no identity cache, verification bypass or second coordinator is introduced.

Shared native dialogs release modality in a layout effect before paint during uncertainty, so Retry remains reachable. They retain input, disclosure/history ownership, inner scroll and focus, restoring those after same-account verification. Source/main focus restoration uses preventScroll; unrelated providers and draft stores remain mounted. Calendar reserves bounded space for pending/success/failure/incomplete feedback. The shared confirmation notice is fixed outside normal flow. Duplicate recovery sections are suppressed only while that editor or request owns the input; the shared draft/revision/request key remains intact and closed/failed/uncertain input stays reviewable.

Acknowledged records/deletions still reconcile the affected canonical block locally. The existing saveEpoch refresh, scope read generation, account leases, memberships, Origin/expected-account checks, aborts and obsolete completion guards remain. Failed authoritative reads are explicitly incomplete, not a successful empty schedule or an uncommitted mutation. New creation/move/resize/remove/edit do not change task status, ownership, user time zone, date/view/scope or gesture semantics. Task 026 selection/touch/sortable work is not implemented.

The session ownership tests exposed an older-read implicit retry: after a newer verification failed, a previously dispatched read could complete and start another probe that lifted the error gate. PlannerSession now refuses incidental verification while failed; only explicit revalidation may reopen it. A late 401/412 body also rejects before issuing its normal revalidation signal when a newer failure is already active. Current 401/412, focus/pageshow/storage, Retry and navigation signals still verify authoritatively. Version/epoch/lease handling and account invalidation remain in the original coordinator.

### Reproduction and completed checks

The accepted baseline retains the same grid node but collapses its protected root during a held preflight: the corrected regression measured a **1440 px root-width change** (to zero). This supports layout replacement/remeasurement rather than a literal document reload. The first baseline capture helper could not find a scrollable element under display:none; its fallback was corrected before recording the numerical failure. The initial three coordinator tests had **two failures / one pass** on the baseline (implicit retry and superseded probe ownership). These failed attempts are not claimed passed.

Lint/strict types, Prisma schema validation and the final Webpack build passed. Guarded migration status reports **16 applied, none pending**. No schema, migration, dependency or saved environment changed; no new fresh/populated upgrade proof was needed or claimed. Full backend/unit verification passed **172/172 across 19 files in 33.37 seconds, exit 0**, including five new coordinator checks for older 200/401/412 bodies, superseded pending/failure probes and an A body held across a B identity change.

The first held-layout browser selection passed **five cases / zero failures / one intentional Android mouse-only skip, six total, 1.5 minutes**. The later focused session/layout selection passed **15 cases / zero failures / one intentional Android mouse-only skip, 16 total, 3.7 minutes, exit 0**. That includes all existing session-isolation cases and held preflight/body/post-body checks with unchanged geometry, dialog scroll, one actual mutation and no document navigation. A further failed-verification/Retry selection passed **2/2 without skips in 34.5 seconds**, preserving dirty input/focus/geometry while native dialogs and protected controls are concealed. These are separate runs, not a combined full-suite result.

Four new browser scenarios cover same-account explicit edit; create/remove with an older successful read held across a newer failed refresh (no deleted-block resurrection or false empty success); real drop/move/resize with held preflight and settled metadata generations; and a failed identity check/Retry with dark concealment and restored input focus. Core workflows run on desktop and Pixel 7 touch emulation. Only the real-mouse gesture scenario skips Android; explicit creation/removal/touch activation remains covered.

The first complete browser run finished **201 passed / five failed / 14 intentional Android mouse-only skips, 220 total, 49.3 minutes, exit 1**. All five Android failures (activity Trash restoration, Calendar overlay recovery, tag removal and both clean/dirty and unavailable work-editor Trash navigation) recorded the fixed confirmation message intercepting a recovery action. The notification surface is now pointer-transparent while Dismiss remains interactive; the held-save scenario additionally checks actual mouse/touch dismissal without geometry change. No existing failing assertion was weakened.

After that correction, lint/strict types and the Webpack build passed again. All five previously failing scenarios plus held-save dismissal passed on desktop and Pixel 7: **12/12, no skips, 3.6 minutes, exit 0**. The corrected-build full backend/unit rerun passed **172/172 across 19 files in 51.10 seconds, exit 0**. The final complete browser rerun passed **206 cases / zero failures / 14 intentional Android mouse-only skips, 220 total across 31 files, 50.7 minutes, exit 0**. All 110 desktop cases and all 96 applicable Android cases passed. The fourteen skips include the new real-mouse stable-save scenario and the existing mouse-only preview/gesture/tag cases; explicit Android touch editing/creation/removal and held verification/Retry remain covered. These final complete results are separate from the earlier failing and focused runs. Application/test source stayed unchanged throughout the final full rerun.

### Commands and verification environment

```powershell
npm run check
npm run db:validate
node .local/task014-command.mjs node_modules/prisma/build/index.js migrate status
npm run build -- --webpack
node .local/task014-command.mjs integration
node .local/task014-command.mjs browser stable-save-feedback.spec.ts session-isolation.spec.ts
node .local/task014-command.mjs browser stable-save-feedback.spec.ts --grep 'failed verification'
node .local/task014-command.mjs browser
node .local/task014-command.mjs browser activity.spec.ts calendar.spec.ts tag-removal.spec.ts trash-navigation.spec.ts stable-save-feedback.spec.ts --grep 'Trash activity stays|calendar overlays retain|Settings removal exports|clean and dirty work-editor|record-unavailable recovery|held Calendar save'
```

The inspected ignored adapter maps integration/browser to README npm test/npm run test:e2e with the same arguments and guarded process-only test environment. Loopback 15432 avoids this Windows checkout's reserved saved 55432 port; saved .env/.env.test and credentials remain unchanged. This is not a new Ubuntu requirement. Actual logs/captures live under ignored .local/task025-*; generated clients, local cluster data, output, credentials and screenshots are excluded from the candidate. No real provider, production data or server is used by these checks.

### Review and operating limits

Supplied/regenerated Light/System-dark held-gate, failed-verification and resumed-draft desktop/Pixel 7 captures were inspected for concealed protected content, containment, scroll and focus. This uses Chromium touch emulation, not physical Android, other-engine or screen-reader certification. Genuine identity uncertainty still deliberately conceals the planner behind a neutral placeholder; this change removes collapse/remeasurement and position loss, not required verification. Explicit navigation/account/logout retain normal routing. Drafts are memory-only; saving requires a connection.

No fresh install/audit, default Turbopack, Ubuntu/proxy/TLS/provider, container or deployment/restore result is claimed. The six pre-existing staged coordinator inputs, including the unchanged 026 specification, are preserved. Task-owned source/tests/docs are staged for independent session/recovery review before 026. Owned app/SMTP/database fixtures are stopped; no listeners remain on 3100–3126 or 15432/15434/15435. The owner commits/pushes/deploys; none was performed by this task. Proposed commit message: **fix: preserve planner layout and scroll during verified saves**.
