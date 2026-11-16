# 023: Calendar workspace scope and compact event presentation

Status: Implemented and verified above the owner-integrated, independently accepted task 022 baseline `fb0ee56` (2026-11-16). Independent review is pending. The specification below remains the acceptance contract.

## Outcome and inputs

Reduce Calendar clutter, align the palette with visible workspaces, use project colors, and replace the large floating preview caption with a preview resembling the event that will be saved. Read AGENTS.md, README, product/architecture/current handoff, tasks 009/011/013/017/019 and their reviewed gesture/session/history fixes, plus task 022. Inspect Calendar preference services, `calendar.tsx`, drop controller/hit testing/preview, block editor, palette helpers and existing real-pointer/mobile regressions.

Confirmed requirements: creation workspace is Calendar's default scope; workspace choices move into Advanced; hidden-workspace work cards disappear; Calendar work is colored by project; preview text sits in the proposed block rather than a large New one-hour block caption. The owner accepted an optional Agenda alternative and preserving explicit keyboard/Android scheduling. These supersede task 019's visible-caption format and its earlier permission to schedule hidden-workspace cards from the palette; they do not change canonical ownership or scheduling authority.

## Workspace visibility and defaults

- Source inspection at `9e41324` found grid blocks filtered by `visibleIds` but palette/work counts built from every authorized scope (`scopes.flatMap(scope.work)`). Fix palette, counts, choices, preview and release eligibility together. Only selected-workspace cards appear, even if the user is authorized for more. A stale held source from a newly hidden workspace must not schedule after filtering changes.
- Recommended explicit saved Calendar preference mode: **Follow creation workspace** (new/default) versus **Selected workspaces** (custom multi-select, including empty). In Follow mode, changing the sidebar default changes Calendar's scope; in custom mode, it does not rewrite the user's selection. The Advanced form offers a clear return to Follow mode. Board's saved scope remains independent.
- Preserve existing saved Calendar workspace arrays as custom selections on upgrade, including an explicitly empty array; do not guess whether an existing choice was deliberate or reset it silently. Accounts with no prior Calendar selection start in Follow mode. Make the current scope/mode concise and discoverable; document that existing users can choose Follow in Advanced. Changing preference representation requires additive migration/API compatibility and tests.
- Recheck authorized memberships server-side, prune revoked IDs and use the established personal fallback for a revoked creation default. A custom empty selection remains empty. Visibility is not authorization; APIs still permit ordinary authorized block editing and explicit creation in its chosen workspace.
- Do not widen the view because of a new block, filter change, draft or restored work. Existing ownership stays immutable. Retained drafts outside the current view remain deliberately accessible as retained input, distinct from the work palette and counts. Remove the large routine Show creation workspace reminder; an explicit out-of-view creation can give a compact acknowledgment/action without automatically adding that workspace.

## Project color and saved-event rendering

- Reuse the existing project identity hash and named tag/project palette; project rename/reordering or workspace selection does not change its tint. Derive task/subtask color from canonical `projectId`; direct project blocks use their project ID. Standalone tasks and empty blocks use a deliberate neutral style. Retained Work in Trash blocks keep truthful labels/context and a consistent tint when the project identity remains available.
- Apply colors consistently to palette cards, saved events, Agenda and preview, with readable Light/Dark text/focus/borders. Keep tag chips distinguishable and retain names/context: color alone is not identity or status.
- Prefer one compact saved-event/preview formatter so a new block preview shows the title/label and time text that will actually appear after the save. A normal blank drop keeps the existing one-elapsed-hour, 15-minute-snapped rule; movement changes its proposed interval, not the work title. Assigning an existing empty block previews its preserved label and original interval plus work context, without silently renaming or resizing it.

## Compact live preview and safety

- Remove the large detached New one-hour block caption. Put a compact time range and event title inside the clipped proposed rectangle. Once the valid in-grid preview is visible, avoid a duplicate floating full-context work card over it; outside the grid a small title-only drag representation is acceptable.
- Keep full interval/date/zone information accessible without turning it into the large visible overlay again. A cross-midnight range must indicate the next day, e.g. `23:45–00:45 (+1 day)`. Ambiguous/missing local times show a concise **Review time** state and retain the explicit post-release Review action; invalid/occupied/foreign/pending targets show concise Unavailable feedback. Do not draw a normal valid-save cue for these cases or infer an occurrence silently.
- Preserve the noninteractive, session-gated preview and shared hover/release resolver from task 019. Clip rather than grow the rectangle to fit long text; small slots can truncate visually while exposing full accessible text. No preview pointer interception, document/palette scroll growth, accidental foreground-event-to-blank conversion or layout-induced coordinate drift.
- Keep zero hover writes, one actual create/assignment on release, explicit uncertain/conflict reconciliation, stale-context/generation cleanup, cancellation on filter/range/account/access change, DST boundaries and truthful elapsed duration. A normal drop/move/resize must not auto-open an edit dialog; a deliberate subsequent click still edits. Changing presentation does not authorize new touch-drag requirements.

## Optional Agenda and explicit scheduling

- Remove the always-open **Agenda and explicit controls** section and its duplicate explanatory/control layout beneath the grid. Retain **Agenda** as an optional compact view alongside Day/Week, reusing the existing chronological block list rather than adding another calendar library. Show the selected view instead of rendering a second full calendar/list underneath.
- Keep **New block** and the existing time-block overlay's work picker, time inputs, assignment/replacement and Remove actions. Clicking a work card edits work; clicking a saved event edits its block. Neither replaces the ability to create an empty block or schedule through touch/keyboard without dragging.
- Agenda rows provide accessible block activation and concise time/work context; grid interactions must also have keyboard/touch access or a clearly reachable Agenda alternative. Agenda follows identical workspace/project/tag/search predicates and loaded/incomplete counts. Failed loading must not look like a successful empty schedule.
- Preserve read-only Trash/history behavior, independent task status and block-only Remove. No loss of pending/dirty/uncertain edits through view changes, Back, resize or theme changes.

## Acceptance and verification

1. Follow default, change creation workspace, choose custom multi-workspace/empty scope and reload another session. Preserve old explicit selections on upgrade and test revocation/fallback. Palette, grid, Agenda, dropdown choices, counts and drop eligibility agree; no personal cards appear when personal workspace is excluded.
2. Real held-mouse tests verify inline preview title/time/color, matching saved output, blank one-hour drops, existing empty assignment, occupied/foreign rejection, cancel/scroll/resize and filter/account/range invalidation with zero hover writes. Measure bounds and hit testing; inspect fresh compact-preview screenshots.
3. Test cross-day/clipped, DST gap/repeated times and offsets. Small labels remain honest and accessible; review-required drops cannot silently save or auto-open a dialog. Existing block drag/resize retains no-popup behavior and the next deliberate click works.
4. On Pixel 7/touch and keyboard, use Day/Week/Agenda, open/edit/remove blocks, create an empty block and schedule project/task/subtask through the explicit dialog. Work cards continue to edit work. No duplicate long section remains beneath the chosen view, and horizontal grid scrolling is contained.
5. Check project/standalone/empty/Trash colors, long labels and tag chips in Light/Dark/System; stable project identity/color mapping across all three planner pages. Failed/incomplete metadata cannot show stale editable cards or a false saved preview.
6. Run README lint/types/build, schema/generation/migration and populated preservation checks if preferences change, meaningful preference/permission/time/filter unit/HTTP tests, and affected Calendar/overflow/DST/Board/tag/Trash/history/session browser cases. Retain task 017 recovery coverage. Record exact counts/skips and physical-device/server limitations.

## Handoff and boundaries

No schedule reinterpretation, automatic status changes, task duplication/transfer, new drag library, recurrence, offline edits or server/provider deployment. This is a scoped presentation/preference change over the accepted planner. Update implemented contracts and README only after verification; keep planned versus delivered behavior distinct. Stage task-owned files and return for independent review; owner commits/pushes/deploys.


## Implementation handoff — 2026-11-16

### Delivered behavior

Calendar now saves an explicit Follow creation workspace/custom mode. New accounts with no prior selection follow the acknowledged sidebar default; custom multi-selection and empty remain independent of that default and Board. Advanced offers both modes with Apply/Cancel and retained failed proposals. Revoked custom IDs are excluded on reads; a revoked Follow default uses the authorized personal fallback. The old workspace-array PUT remains a custom selection. Selected Workspace rows are locked in sorted order and membership is rechecked inside the preference transaction, including a tested removal race.

Palette cards, counts, project/tag choices, grid/Agenda and the shared hover/release source resolver intersect the selected authorized scope. A scope change cancels a held source. The broader authorized work loader remains available for explicit editor choices and retained drafts; neither widens the view. Explicit out-of-view creation gives a concise saved acknowledgment. The routine Show creation workspace reminder is removed from Calendar.

The existing project hash/palette now colors Calendar work cards, saved events, Agenda and preview. Tasks/subtasks use canonical projectId; standalone/empty blocks are neutral, and retained Trash references preserve their identity/context. One shared compact label/interval formatter supplies saved and preview text, next-day markers and full accessible dates/offsets/zone. The proposed rectangle clips its inline text and suppresses a duplicate floating card. Review time and Unavailable remain distinct from a valid save. Existing one-hour blank drops, original-label/interval assignment, zero hover writes, idempotent saves and gesture recovery remain unchanged.

Agenda (week) is a compact chronological alternative to Day/Week, with visible row dates, workspace/status context, tag chips, explicit Edit and Trash links. The duplicate always-open section is removed. Grid events support Enter/Space through the existing guarded edit path. New block and the shared work/time overlay retain keyboard/touch scheduling and block-only Remove. No later feature, scheduling policy, ownership transfer, dependency or environment setting was added.

### Additive migration and data preservation

Migration **202611160001_calendar_scope** is migration **16**. It adds CalendarPreference.mode with a custom backfill for every existing row (including empty arrays), then changes the insert default to follow and adds a follow/custom CHECK. Existing users choose Follow deliberately in Advanced; an old selection is never guessed or reset.

Prisma generation and schema validation passed. Guarded migrate deploy applied migration 16, and migrate status reports all 16 applied with none pending. A fresh owned PostgreSQL cluster applied all 16 with no Prisma schema drift. A second populated-upgrade cluster preserved digests of 18 original populated tables through lists and 23 populated tables through workflows/tags/order/appearance/scope. The proof excludes only deliberately added/migrated fields, checks old nonempty and empty Calendar arrays/time zones remain unchanged and custom, and checks a new row defaults to follow. Existing block instants, revisions, ownership, activity, lists, Trash and tag associations are retained. These checks used disposable loopback fixtures, not real production data; both proof clusters were stopped.

### Verification actually performed

- README Prisma generate/validate, lint/strict types and **npm run build -- --webpack** passed. The final application build precedes the successful final browser selection; subsequent edits affect test capture/fixtures and documentation only.
- Full guarded backend/unit run passed **167/167 across 18 files, 33.44 seconds, exit 0** on the final application build. New checks cover legacy/empty/follow input, canonical project identity, overnight/fold/gap label meaning, saved mode/new login, membership revocation/fallback, foreign Origin/IDs and a real lock-wait removal race. Existing scheduling, permissions, same-workspace relationships and recovery checks remain included.
- An initial focused preview/presentation run passed **10 cases / zero failures / six intentional Android mouse-only skips, 16 total, 3.7 minutes** on an earlier presentation candidate.
- The affected browser selection completed **114 passes / five failures / 13 intentional Android mouse-only skips, 132 total, 31.7 minutes**. Its five failures were three explicit pointer activations occluded by overlapping grid events and two expectations for the removed always-open Agenda message. Fixtures now deliberately use Agenda touch controls/native grid keyboard activation for the recovery cases and switch to Agenda for its empty state. Real desktop drag/hit-testing and the separate mobile grid-tap regressions are retained.
- The first correction selection passed **12 cases / two new fixture failures / two intentional skips, 16 total, 3.8 minutes**. Both new Trash-case failures expected a trailing space that the existing canonical API trims; input was corrected without changing application behavior.
- The final correction/presentation selection passed **14 cases / zero failures / two intentional Android mouse-only skips, 16 total, 3.7 minutes, exit 0**. All five earlier failures pass on both applicable profiles. All four new scenarios pass where applicable: Follow/custom/empty and out-of-view creation; theme/color/dated Agenda plus touch/keyboard edits; real held-source invalidation (desktop); and long/overnight/Trash/tag context with unchanged block identity/revision/instants. The skipped cases are held-mouse preview and held-source tests; explicit Android scheduling and activation are exercised.

Additional final desktop held-preview verification passed **1/1 in 24.1 seconds, exit 0**, with Light and System-dark captures and finite theme transitions settled for screenshots. Bounds/hit-testing, stationary-pointer scroll, zero hover writes and the exact saved interval remain asserted. Command: `node .local/task014-command.mjs browser calendar-drop-preview.spec.ts --grep 'live blank-slot' --project desktop`. Final lint/types also passed after the fixture/capture edits.

The affected selection also passed the existing Calendar DST/gesture/move/resize/save/session cases, compact filters, overflow bounds, Board controls, task 017's three Board tag-recovery cases, migrated tags, cross-view tags, appearance, comments/history, native Back, Trash and account-isolation scenarios. **No new all-green full application browser run, or all-green rerun of all 132 affected cases, is claimed.** The final focused pass resolves the recorded failures; it does not erase the earlier attempts. The initial backend attempt also used an older production build (164 passes/three new-mode failures); rebuilding corrected that, followed by three successful 167-check runs.

Commands used (the inspected ignored process-only adapter maps integration to npm test, browser to npm run test:e2e, and migrate to the guarded README test migration command):

```powershell
npm run db:generate
npm run db:validate
npm run check
npm run build -- --webpack
node .local/task014-command.mjs migrate
node .local/task014-command.mjs node_modules/prisma/build/index.js migrate status
node .local/task014-command.mjs integration
node .local/task014-command.mjs browser calendar.spec.ts calendar-presentation.spec.ts calendar-drop-preview.spec.ts calendar-gesture-review.spec.ts compact-filters.spec.ts 011-overflow.spec.ts mobile-surfaces.spec.ts board.spec.ts task-labels.spec.ts tag-recovery.spec.ts trash.spec.ts trash-navigation.spec.ts dialog-history.spec.ts activity.spec.ts session-isolation.spec.ts settings-appearance.spec.ts
node .local/task014-command.mjs browser calendar.spec.ts calendar-presentation.spec.ts mobile-surfaces.spec.ts calendar-drop-preview.spec.ts --grep 'calendar distinguishes|obsolete workspace-access|Follow creation|project tints|held source|Trash tint|Calendar exposes|live blank-slot'
```

Portable equivalents are README npm test / npm run test:e2e with the same file/grep arguments, after test migration and a successful build. This checkout uses loopback **15432** because Windows reserves saved port 55432. Saved .env/.env.test and credentials remain unchanged; this is not a new Ubuntu configuration requirement. Fresh/upgrade scripts and logs live in ignored .local/task023-* files, alongside final build/backend/browser logs; no secret-bearing files or generated clients are staged.

### Review and operating limits

Fresh desktop/Pixel 7 Light/Dark/System Agenda, neutral/project colors, long-label/tag/Trash/overnight and compact held-preview captures were inspected for wrapping, clipping, focus and document containment. System captures use a dark emulated device scheme; the existing appearance regression also exercises OS changes. This is Chromium/Pixel 7 touch emulation, not physical Android, other-engine or screen-reader certification. No Ubuntu/proxy/TLS/Mailcow/provider, container, fresh dependency install/audit, default Turbopack or deployment result is claimed. Existing pinned dependencies are reused unchanged. Drafts remain account-bound browser memory and saving still requires a connection.

Coordinator next step: independently review this candidate above fb0ee56, including the migration/backfill, membership race, hidden held source, explicit Agenda/keyboard activation and unchanged gesture/save/recovery boundaries. Owner commits/pushes after review. Rollout uses the existing stop/update/install/migrate/build/restart/browser-reload sequence, with a real backup before migrations, all 16 migrations and no database reset. No commit, push, production data/server/provider action or deployment was performed.

Proposed commit message: **feat: refine Calendar workspace scope and compact event presentation**.

Final cleanup/staging: the task-owned main verification database, app and SMTP fixtures are stopped; no listeners remain on 3100–3126 or 15432/15434/15435. Documentation links and Git whitespace checks passed. All 23 task-owned files are staged for independent review, with no unstaged changes. Saved environments, credentials, generated clients, screenshots and local proof/database/log files are excluded. No commit or push was made.
