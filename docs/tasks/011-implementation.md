# 011 implementation handoff

Status: Implemented as `a621e0f`; coordinator review on 2026-11-09 found two P2 corrections. The follow-up from `84037c2` implements and verifies those corrections; independent re-review remains pending. See [review fixes](011-review-fixes.md). The owner assigned all slices A–E together on 2026-11-08, superseding the planning record's instruction not to begin subsequent slices automatically. Original implementation base: `48aa587`.

## Delivered scope

| Slice | Implementation and contracts |
| --- | --- |
| A: Calendar drag overflow | Reproduced with a real mouse: palette scrollWidth grew from 254 to 4,945 px while document width stayed 1,440. Sources now remain stationary; a bounded dnd-kit DragOverlay is portaled outside the scroller and inside the protected session wrapper so identity failures hide it. Gated gestures cannot dispatch. The same test measures 254 px throughout the gesture, with stable palette height/document width. Ordinary scrolling remains; drag auto-scroll is intentionally disabled. |
| B: Context/settings/editors | Saved account creation-workspace default above navigation, compact horizontally scrollable Android navigation, independent Board/Calendar selections, canonical project/task/subtask/block editors and responsive native dialogs. Dirty dismissal asks Keep editing/Discard changes; Keep draft for later retains input explicitly. Pending locks prevent duplicates/dismissal. Original revisions/conflicts and Calendar intent keys survive navigation. Native dialogs contain focus, make the background inert, handle Escape/backdrop/Back and pause during identity checks. Context reads can retry without dropping the draft. |
| B: Scheduling model | Account-owned PlannerPreference migrates the previous Calendar zone once. Workspace timeZone/settingsRevision are separate metadata. Owner-approved defaults: owner-only revision-checked changes; UTC for existing workspaces; new shared workspaces visibly default to the saved user zone (UTC before a saved choice; the form can use browser detection). Personal bootstrap starts at UTC. User-zone entry/view, workspace-local equivalents, UTC instants, captured dirty input zones, gap rejection and explicit folds are implemented. Both block boundaries convert into the user zone; label-only changes retain subsecond instants/historical input-zone metadata. |
| C: Projects | Compact project → task → one-level subtask disclosures, separate title/editor actions, contextual add actions, Standalone group, immutable saved ownership and parent/project context. Expansion remains during same-account navigation/manual refresh. Parent and child completion stay independent. |
| D: Board | Compact whole-card desktop MouseSensor dragging with an 8px threshold and bounded overlay; click/tap/Enter opens the shared editor. Project identity determines stable labeled color tints. Apply/Cancel filters cover workspaces, project/Standalone, created/edited dates, title and Hide Done. Inclusive dates use next-local-midnight exclusive bounds in the user zone. Complete loaded data supplies counts and subtask context; failed scopes are labeled incomplete. Draft/conflict proposals remain discoverable. Dialog opening cancels a gesture. A save that filters out a card acknowledges success and uses an account-guarded focus fallback. Long titles wrap in the dismissible confirmation, which reserves document space instead of blocking agenda controls. |
| E: Calendar | Shared block overlay, event/agenda activation, New block, desktop timed-slot activation and keyboard/touch Schedule buttons. Blank-slot drops create one stable-key block of 60 elapsed minutes in the work's workspace. Existing empty-block drops assign without changing identity/interval/count; occupied/foreign foreground events reject implicit replacement. Hit testing uses actual viewport mouse coordinates rather than scroll-adjusted dnd-kit deltas, including scrolled/overlapping events. Repeated starts retain the one-hour default after occurrence selection. Native move/resize, explicit assignment/unassignment, revision deletion, uncertain-intent reconciliation and deleted-versus-revoked distinctions remain. Long labels are clipped to their grid event; the collapsible agenda/editor retains full details. Assigned work can open its canonical editor after explicitly retaining the block draft. |

## Primary review entrypoints

- Settings/permissions: `src/server/settings.ts`, new planner/workspace settings routes, `src/server/workspaces.ts` and the two migrations.
- Shared UI state: `planner-context.tsx`, `planning-drafts.tsx`, `ui/editor-dialog.tsx`, `entity-editor.tsx`, `block-editor.tsx`.
- View behavior: `projects-planner.tsx`, `board.tsx`, `calendar.tsx`; date/color and grid-hit helpers under `src/lib`.
- Regression evidence: planning/Board/Calendar/settings/session browser specifications, `tests/unit/planner-settings.test.ts` and settings HTTP/PostgreSQL cases in `tests/integration/workspaces.test.ts`.

## API/data changes

- Additive migrations `202611080001_planner_settings` and `202611080002_preference_user_fk`; six migrations total. The second aligns the new preference user FK's update cascade with Prisma. No applied migration was edited.
- `GET/PATCH /api/planner/preferences`: verified account only, partial field patches, accessible default validation under the membership lock, safe personal fallback. No caller-supplied actor.
- `GET/PATCH /api/workspaces/[id]/settings`: current membership read; owner-only write under the same lock/recheck as membership changes. Expected settings revision, safe 409 review, strict IANA/field validation, exact Origin/account preconditions and no-store responses.
- Calendar workspace preferences remain independent. Legacy optional `timeZone` input is validated/accepted but cannot overwrite the migrated user setting; reads never repeat the migration. Historical `TimeBlock.timeZone` remains editing/input context, never workspace metadata.
- Existing workspace ownership, work references, status IDs and overlap policy are unchanged. New creation context constrains project tasks/subtasks/assignments to their actual workspace; saved records cannot transfer.

## Actual verification

Windows, Node 24.19.0/npm 12.0.2, portable PostgreSQL 17.11. Application dependency versions/package manifests/lockfile are unchanged; `npm ls --depth=0` passes. Native dialog and the pinned dnd-kit/FullCalendar/Luxon APIs are reused. Prettier 3.9.10 was used once without adding a dependency.

- `npm run db:generate` and `npm run db:validate`: pass.
- `npm run db:migrate` and `npm run db:test:migrate`: both additive migrations applied successfully to separate loopback development/guarded test databases. No reset.
- Fresh guarded database: `.local/task011b-fresh-migration-check.mjs` applied all six migrations; Prisma schema diff reported no difference; temporary cluster stopped.
- Representative upgrade: `.local/task011-upgrade-check.mjs` built the four-migration baseline in a separate guarded database, seeded one row in each of 12 legacy tables (user/account/session/verification/workspace/membership/project/task/Board preference/Calendar preference/block/create intent), then applied both new migrations. Complete-row digests matched, excluding only the two newly added Workspace columns. Project/task/block revisions 4/9/7, subsecond UTC endpoints, work references and ledger payload survived. `America/Los_Angeles` migrated to the account preference; schema diff reported no difference. Temporary cluster stopped. Sanitized proofs/scripts remain ignored under `.local`, not staged.
- `npm run check`: lint and strict types pass without warnings.
- `npm run build` (Turbopack) and `npm run build -- --webpack`: pass. Browser/backend verification uses the Webpack build.
- `npm test`: **85/85 checks across seven files pass**, including settings account/Origin/precondition boundaries, owner/editor rights, concurrent settings revisions, role recheck after waiting behind a workspace lock, revocation fallback, legacy-client isolation, preserved instants/ledger, DST date bounds, two-user start/end conversions and repeated-time one-hour defaults. Existing auth, canonical work, session-cookie, membership locking and Calendar idempotency/relationship regressions remain.
- Focused corrected account/Board/preview/session browser run: **13/13 desktop cases pass**. Initial integrated attempt had 49 pass/12 fail/one intentional desktop-only-palette skip on Android: stale sidebar/default/status assertions, filter activation before its loading control was enabled, and session-failure injection before editor context finished loading. These were corrected rather than skipped; editor-context retry was also added.
- Intermediate integrated run: **61 passed / one intentional Android skip (62 cases total)**. The palette mouse test is desktop-only; Android scheduling/touch paths run separately. Focus fallback and long-title confirmation refinements then passed **2/2 focused desktop/Android cases**.
- A later Android run exposed two clicks obstructed by the fixed save confirmation. The confirmation now reserves normal document space, remains dismissible, and the affected Calendar flows pass. A protected-root portal/gesture gate regression was added for identity-check failure; native Calendar mirrors use the same protected root. Focused hardening run: **7 passed / one desktop-only-palette Android skip (eight cases total)**, covering the palette gate, native move/resize and both affected Calendar/account flows.
- Final integrated desktop/Pixel 7 browser result after those refinements: **61 passed / one intentional Android skip (62 cases total)** in 13.2 minutes; exit code 0. The skipped palette regression requires a desktop mouse; Android explicit scheduling and touch workflows passed. `git diff --cached --check` also passes.

Browser coverage includes real mouse drags/resize, touch scroll/tap emulation, keyboard controls, native dialog naming/dirty-close/Back/pending behavior, canonical cross-view conflicts, independent selections, date/project filters, viewport bounds, user/workspace zone equivalents, retained captured zones, ambiguous/gap times, unknown creates/deletes, deleted targets, genuine revocation, obsolete range/access/identity/save responses and logout. Screenshots supplement server-write assertions; they do not substitute for them.

## Limits and operating notes

### Independent coordinator review — 2026-11-09

Reviewed `a621e0f` and confirmed the redesigned UI is present in a fresh local build. Independently passed `npm run check`, `npm run db:validate`, `npm run db:test:migrate` (six migrations; none pending), `npm run build -- --webpack` and **85/85 backend checks**. The full `npm run test:e2e` result was **60 passed, 1 failed, 1 intentional Android skip** in **14.2 minutes**, exit 1. The overflow test measured stable dimensions but failed at its post-drag Retry click. Separate disposable-account reproductions showed the extra Back step after normal editor closure and zero verification requests after the suppressed Retry click; keyboard activation recovered. These results are distinct from the earlier implementation-era 61-pass/one-skip run above. Review left tracked files unchanged; the subsequent documentation handoff assigns [the corrections](011-review-fixes.md). No live Ubuntu/HTTPS or physical Android check was performed.

### Review correction follow-up — 2026-11-09

The current follow-up preserves reviewed task 012 and corrects dialog-owned history reconciliation plus the overflow fixture's post-drag Retry. It reproduced both findings at `84037c2`, including history growth 3 → 6 and one Back remaining on Board. The correction keeps one reusable owned slot, consumes it on normal closure/save/retention, restores it for blocked Back and preserves Next state/account guards. The Retry fixture uses a bounded 75 ms Space press and verifies a real successful probe; no pointer, bounds, hidden-preview or zero-write assertion is removed.

New verification: 94 backend checks pass, both builds and lint/types/schema/migration-status checks pass, a development effect-replay smoke passes, and the final focused browser run has seven passes plus one intentional Android skip. The final integrated run passed 69 cases with zero failures and one intentional Android skip (70 total) in 15.8 minutes; the earlier 68-pass/one-failure/one-skip run and subsequent Calendar fixture refinement are recorded separately. These are follow-up results, separate from the original 85-check/62-case results and coordinator review above. See [correction completion](011-review-fixes.md#correction-completion--2026-11-09) for exact commands, failed baseline/intermediate attempts and final limitations. Independent re-review remains pending.

### Remaining operating limits

- Independent re-review of the correction is still required. This follow-up performs no commit, push, deployment, SSH, firewall, reverse-proxy or production-server change.
- Desktop Chromium and Pixel 7/Android Chromium emulation are available; physical Android hardware, an actual soft keyboard, Ubuntu/container runtime and the owner's live HTTPS/SMTP infrastructure are not verified here.
- Drafts, extra Board filters and hierarchy expansion are account-scoped memory, preserved through planner navigation/manual data refresh, not document reload/close. Among these UI preferences, account settings/default workspace and view workspace selections persist across devices. Full reload/account changes lose unfinished input; this is not offline editing.
- Calendar creates retain an idempotent ledger/key. Project/task creates still use their existing API without a create-intent ledger: an unconfirmed create must be checked before retry; the editor says so. Discard never promises server rollback.
- Scheduling uses Node/browser Intl IANA rules; keep those runtimes current. Settings change representations, not instants. Live push, transfers, custom statuses, deeper nesting, recurrence, all-day work, work deletion/archive, lists/notes and later roadmap features remain outside this task.
- Owner refresh instructions remain in README. Apply migrations before rebuilding/restarting a pulled checkout; no database reset is needed.

## Review package

The original redesign is committed as `a621e0f`; the current review-correction package contains the shared history helper/editor change, browser regressions and documentation. No new schema, migration, API or dependency change. Generated Prisma/build/test output, `.env` files and `.local` credentials/data are ignored. Leave commit/push to the owner.

Suggested commit message:

```text
Fix editor history and post-drag session retry

Reconcile dialog-owned entries without adding phantom Back steps.
Preserve dirty, pending, retained-draft and account-boundary behavior.
Verify keyboard Retry dispatch and desktop/Android history navigation.
```
