# 023: Calendar workspace scope and compact event presentation

Status: Planned on 2026-11-15; implement after task 022 is integrated and independently reviewed. Integrate task 020's themes if present. No runtime changes or application checks were performed for this specification.

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
