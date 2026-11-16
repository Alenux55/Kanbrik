# 020: Settings hub, appearance and centralized tag management

Status: Implementation candidate above `9e41324` (accepted runtime `2742d15`), explicitly assigned on 2026-11-15. Implementation verification completed; independent review is pending. Tasks 021–023 remain unimplemented specifications.

## Outcome and inputs

Reduce task-editor clutter by moving workspace tag administration into a Settings hub. Include existing user preferences and a Light / Dark / System appearance choice. Read AGENTS.md, README, product/architecture/stack, the current handoff, task 017 and its independently closed review corrections. Inspect existing `/settings`, navigation, `settings.tsx`, `task-tag-editor.tsx`, planner preferences/session/draft providers, palette helpers, and workspace configuration routes.

Confirmed direction: a higher-level Settings section; centralized tag creation/edit/removal; remove Manage workspace tags from task/subtask editors; permission-aware sections. Appearance choices and consolidation of User settings are adopted from the owner's proposal. The role boundaries and UX defaults below are implementation recommendations, not a new sharing policy.

## Dependencies and scope

- Reuse and expand the existing `/settings` route; rename the navigation entry and page title to Settings. Preserve existing links, saved user time zone, account invitation administration and workspace configuration. Do not add a competing settings store or duplicate configuration forms.
- Account section: preferred time zone and Appearance. Workspace section: an explicit, local workspace selector and Tags manager. This selector must not change the sidebar creation default or Board/Calendar visibility preferences. Group or link existing workspace zone/workflow/membership settings under their current permissions; moving all those forms is not required.
- Every authenticated user can edit their own preferences. Current members retain existing content rights to manage tags in their workspace. Workflow, workspace zone and membership administration remain owner-only. Account invitations retain the separate server allowlist; owning a workspace does not make someone an invitation administrator. Hide/disable unavailable UI appropriately and retain server enforcement on every endpoint.

## Centralized tags and draft continuity

- Provide a compact, searchable list of tags for the chosen workspace, with name, named palette color, lifecycle and edit actions. Support existing create, normalized-name reconciliation, rename/recolor and archived-definition restore. Stable IDs and the six shared palette keys remain authoritative. Encode all dynamic identity path segments, including migrated Important/Urgent IDs.
- Move definition forms out of task/subtask editors. Keep assigned chips, remove-association controls and typeahead selection of existing tags. A small Create/manage tags link may open the scoped Settings section; it must preserve unfinished task/comment/list input through existing navigation/history guards. Do not recreate an in-editor administration panel.
- Preserve discoverable recovery for uncertain/failed tag-definition drafts created before or during the move. A retained metadata draft must open a working Settings form with its original workspace, revision and request key; an old task target must not strand it at a removed form. Do not silently retarget it when changing the Settings workspace.
- Refreshing tag metadata must not replace task selections, rebase task revisions, discard unrelated input, or misinterpret a record-level 404 as workspace revocation. Deletion of the task that originally opened Settings does not grant or revoke workspace metadata authority.
- Task 021 supplies the stronger confirmed Remove behavior, warning/export and detachment. Until it lands, existing archive behavior must be accurately labeled as retaining existing assignments; do not present it as detaching tags or claim task 021 is delivered.

## Appearance

- Recommended default: System. Persist the authenticated account's explicit choice on the server through the established preferences contract, with additive migration/backfill if needed. Light and Dark override OS changes; System responds to `prefers-color-scheme`. Saved choice survives reload/sign-in and another device. Keep preference writes scoped to the verified account and visibly unconfirmed on failure.
- Use shared semantic surface/text/border/focus tokens and the existing styling stack. Cover navigation, forms, popovers, native dialogs, retained/failed/conflict feedback, Board, Settings, comments/lists/Trash, FullCalendar, project/tag tints and drag previews. Preserve project hash mapping and tag color identities; theme-specific tint presentation may adapt for readable text. Do not leave white panels with unreadable text in Dark mode or rely on automatic browser inversion.
- Initialize appearance consistently before ordinary page paint where practical, avoiding hydration mismatch and a bright flash on a saved Dark preference. Signed-out pages use System by default. OS appearance changes must not remount planner providers, lose drafts, change schedules or save a new preference.
- Existing settings saves should update only submitted fields: changing appearance must not overwrite a concurrent/default workspace or time-zone choice with a stale whole-object payload. Stale-account responses must not apply another account's choice or release its pending lock.

## Acceptance and verification

1. Desktop and Pixel 7: navigate Settings sections, switch workspace locally, create/rename/recolor/restore UUID and migrated-ID tags, then assign them in tasks through a compact autocomplete. Manage workspace tags and embedded metadata forms are absent from task editors.
2. Navigate to Settings from dirty/new/existing task, comment and list input and return via Back/retained input. Keep original revisions and uncertain metadata intent; pending operations still guard navigation. Test delayed obsolete replies, account switch and verified membership loss.
3. Owners/editors/nonmembers/invitation administrators see only allowed sections. HTTP tests reject forged workspace/user IDs and unauthorized preference/configuration writes. Reuse current tag endpoints and authorization rather than a client-only permission gate.
4. Verify saved Light/Dark/System on reload and another session, OS changes in System versus explicit modes, failed saves and account isolation. Inspect fresh desktop/Android screenshots in all modes, including dropdowns/dialogs, Calendar and colored cards; verify focus, contrast, text wrapping and touch targets.
5. Run README generation/schema/migration checks when persistence changes, lint/types, Webpack build, meaningful settings/tag/session backend tests and affected browser/history/Trash regressions. Apply additive migrations to fresh and populated data if introduced; preserve existing time zones, defaults, work, tags, history and block instants.

## Handoff and boundaries

No new roles, global shared tag namespace, workflow-policy changes, offline edits, hard purge or task 021 bulk detachment in this task. Record actual commands/results, adopted defaults and limits here; update implemented contracts/README and current handoff, stage only task-owned files, and return for independent review before task 021. Owner commits/pushes/deploys. Do not claim a planned feature is installed.

## Implementation candidate — 2026-11-15

The existing `/settings` route and navigation now say Settings. Account contains the existing time zone form and an explicit Light/Dark/System save. Workspace contains an independent local selector, searchable tag list with named colors/lifecycle, a single definition editor, retained-definition recovery and permission-aware links to the existing workspace configuration. Invitation administration keeps its server allowlist and original form. Workspace members retain content rights for tags; ownership does not confer invitation administration or change owner-only workflow/zone/membership writes.

Task/subtask editors now contain assigned chips, removal of individual associations, existing-tag autocomplete and a guarded Create/manage tags link. Definition creation/edit/archive/restore is centralized in Settings. Archive is explicitly labeled as retaining existing assignments; no task 021 warning, export or bulk detachment is implemented. Tag identities, normalization, palette keys, revisions, request receipts and encoded migrated-ID paths remain authoritative.

Tag definitions continue to use the account-bound supplemental draft provider. Old task-targeted tag drafts are routed to Settings by their original key/workspace rather than opening the removed embedded form. The manager validates form/workspace before rendering and never retargets the retained values/revision/request key. Tag mutations/pending UI use the workspace configuration lock regardless of an old task target. Normal task/comment/list locks are unchanged. Record-level failures check workspace access separately; only verified membership loss revokes that scope. Local recovery activations also reopen a retained form repeatedly while already on Settings, without changing the creation default or planner filters.

Adopted defaults (implementation recommendations from this task, not new sharing decisions): account-owned appearance, System default and a local Settings workspace selection. Additive migration `202611150001_appearance` adds the constrained `PlannerPreference.appearance` column, backfilling System. The existing strict preferences PATCH updates only submitted fields. Concurrent independent field saves and forged actor/workspace inputs are covered by HTTP tests.

Root appearance initialization uses a read-only verified-session/preference lookup and renders `data-appearance` before paint. Failure/signed-out identity falls back to System; protected planning still uses its existing verification gate. Root pages are request-rendered for account-specific colors. CSS media queries implement System, while explicit modes ignore OS changes without remounting providers or writing a preference. The client applies changes from the existing account preferences under the current lease; no browser appearance cache, new theme dependency or competing settings store was added.

Shared surface/text/border/focus/action/feedback and FullCalendar variables cover light/dark presentation. Existing project hashing and tag palette identities remain unchanged; their UI tints use theme variables. Auth pages, navigation, forms, dialogs, dropdowns, Board cards, metadata swatches, comments/lists/Trash and live Calendar feedback use these tokens. No scheduling or Calendar scope/presentation phase was implemented.

### Verification evidence

- Prisma generation/schema validation and lint/types passed. The final Webpack rebuild including the repeat-recovery refinement passed.
- Main guarded test database applied migration 15 without resetting data.
- Initial full backend/unit run: **133/133 checks across 14 files, 27.51 seconds, exit 0**, including appearance field isolation/concurrency, origin/account/workspace rejection and server-rendered appearance.
- Fresh owned cluster on 15435 applied all 15 migrations and reported no schema drift. Populated upgrade cluster on 15434 preserved original rows across 18/23 populated tables, including work/tags/history/Trash/block instants and existing preference fields; its original saved zone/default survived with appearance backfilled to System. Both owned proof clusters were stopped. Ignored proof scripts/JSON/logs are under `.local/task020-*`.
- Focused desktop cases passed in separate runs for all appearance modes/OS changes, JavaScript-disabled first paint, another browser context, failed and obsolete-account replies, local workspace scope/permissions/revocation, source-task Trash recovery, new-task Back navigation, all named palette contrast, Dark drag feedback, migrated IDs, existing Board tag recovery and stable definition retries. These are separate focused results, not a full integrated pass.

The first six-case browser attempt failed on fixture body/select locators. Later focused attempts corrected an overly broad native-option count, a missing required empty DELETE body, duplicate alert matching, an obsolete held metadata route and a save assertion that ran during the session-check gate before the task PATCH completed. No failed attempt is claimed passed. A full browser run was deliberately stopped after 21 passes to fix the same-Settings repeat recovery link found during source review; the repeat-click regression and lost-response tag case then passed **2/2 in 35.8 seconds**, exit 0. The final rebuilt backend run passed **133/133 across 14 files in 27.43 seconds**, exit 0. The restarted final integrated browser result is recorded below.

### Commands, review and limitations

Current checks use README `npm run db:generate`, `npm run db:validate`, `npm run check` and `npm run build -- --webpack`. The inspected ignored `.local/task014-command.mjs` supplies only guarded process-local test URLs on 15432: `migrate` corresponds to `npm run db:test:migrate`, `integration` to `npm test`, and `browser` to `npm run test:e2e`. Fresh/upgrade proof scripts use separate owned clusters on 15435/15434, apply the actual migration files and check Prisma drift. Saved `.env`/`.env.test` and credentials are unchanged; no portable Windows setup workaround is a new Ubuntu requirement.

Fresh desktop and Pixel 7 screenshots were inspected in Light, Dark and System, including Settings, palette/dialog/autocomplete and Calendar. Dark live feedback was inspected on desktop. Automated checks measure at least 4.5:1 text contrast on the body, appearance control, active navigation, all six swatches, selected chip and work textarea. New mobile cases retain explicit controls; the full suite also exercises Chromium touch scrolling. This is emulation, not a physical Android/device accessibility certification. No Ubuntu/proxy/TLS/Mailcow/provider-delivery, container, fresh dependency install/audit or default Turbopack result is claimed. Appearance initialization adds a read-only request-time lookup; there is no appearance cache or live cross-device push. Unsaved work remains browser memory, not offline editing.

Independent review of 020 remains required before 021. The earlier 014–019 coordinator acceptance remains carried baseline evidence, not approval of this candidate. Tasks 021–023 remain planned and their pre-existing staged specifications are preserved. No production data/provider/server action, commit, push or deployment was performed. Interrupted fixture runs may leave generated rows in the ignored disposable test database; no broad cleanup/reset was used.

Proposed commit message: `feat: add Settings hub, centralized tags and account appearance`.

### Final integrated result — 2026-11-15

**Full browser suite: 156 passed / zero failures / 12 intentional Android mouse-only skips, 168 total, 36.0 minutes, exit 0.** Command: `node .local/task014-command.mjs browser`, equivalent to the README full `npm run test:e2e` with this checkout's guarded process-only database adaptation. The final build includes the repeated same-Settings recovery refinement. All five new Settings scenarios passed on desktop and Pixel 7; no new Settings case is skipped. The 12 skips are the existing desktop-only overflow, Calendar mouse/gesture and Board recovery-drag scenarios; explicit scheduling, keyboard/native Back, actual Chromium touch scrolling, roles/session boundaries and migrated-tag administration remain covered on applicable profiles.

This is a complete integrated run on final application/test sources, not an aggregation of focused attempts. It includes auth/recovery/invitations, comments/history, restored editors, all Calendar/session/gesture cases, Projects/Board filtering, tags, ordering, Trash/Restore, work lists and workspace workflows. Prior 014–019 implementation/coordinator runs remain separate carried evidence; they are not substituted for this new run.

Final candidate checks: Prisma generate/validate, lint/types and Webpack build passed; guarded test migration 15 applied; full backend/unit **133/133 across 14 files in 27.43 seconds** passed; fresh all-15/no-drift and populated preservation/System-backfill proofs passed. Source/tests were frozen through the successful full run. Screenshot and platform limits above remain in effect. Independent coordinator review is the next gate before task 021.

Final cleanup: the owned main verification database and app/SMTP fixtures were stopped. No listeners remain on verification ports 3100–3126 or 15432/15434/15435. All task 020 changes are staged, alongside the three unchanged, previously staged 021–023 specifications (40 changed files total). Git whitespace checks passed and no unstaged task-owned changes remain. Environment files, credentials, generated output, local database/proof files and screenshots are excluded from the staged diff. Owner commits/pushes and arranges independent review.
