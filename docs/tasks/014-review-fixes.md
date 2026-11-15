# 014: Restore editor availability after activity refresh

Status: Original P2 independently closed on 2026-11-15 at `3287adc`, carrying the correction from `186acc9`. Both desktop and Pixel 7 same-mounted-editor and obsolete-refresh cases passed. The combined candidate remains held for separate [task 017 corrections](017-review-fixes.md); closing this P2 does not approve import. Earlier implementation evidence below remains separately attributed.

## Outcome and inputs

After work is restored by another authorized session, refreshing activity in its still-open editor must reconcile both comments and work availability. Keep local work/comment drafts and their original revision/conflict safeguards.

Read AGENTS.md, README, product/architecture, the coordinator handoff, task 014 implementation/review evidence and task 013's reviewed Trash/navigation contract. Use the existing task 014 candidate (or the owner's subsequent commit of it), not a checkout/reset to `0af0865` that discards the feature. No schema, dependency, API redesign or later feature implementation is expected.

## P2: availability propagation only enters read-only state

Locations: `src/components/work-activity-panel.tsx:120–122` and its continuation handler, plus `src/components/entity-editor.tsx:466–469`. The panel notifies its parent only when `readOnly` is true; the parent callback permanently sets `unavailable=true` for this editor instance. A later authorized activity response with `readOnly=false` resumes comment input but cannot clear the work-editor latch.

Independent desktop and Pixel 7 reproduction on owned loopback port 3115:

1. Open a saved task; retain a changed work description and an unfinished comment.
2. Move the task to Trash through another authorized request. Activate Refresh activity in the open editor: both inputs correctly become unavailable/read-only.
3. Restore the same batch through another authorized request without closing the editor, then activate Refresh activity again.
4. The work detail endpoint returns **200**, the comment input is editable again and the work draft is intact. However, Title and Save changes remain disabled and **This work is in Trash or unavailable** stays visible on both profiles. Closing/reopening is required to resume work editing; there is no in-place recovery.

The existing Trash activity test navigates away, restores and reopens its retained draft. It does not cover restoration while the same editor stays mounted.

## Scope and acceptance

- Propagate the latest authorized active/read-only state in both directions and reconcile parent work availability. If fresh work context is needed, fetch/reconcile it deliberately. Never enable editing based on a failed load, foreign/obsolete response or merely the fact that Trash detail is readable.
- Preserve local work text, comment text, uncertainty/conflict state and original base revisions. Do not silently adopt the restored task's new revision and overwrite another member's changes. A later explicit work save must still enter normal conflict review if its base revision is stale.
- A read-only Trash-detail panel remains read-only even if a caller opens historical detail after restoration. Do not weaken active-target checks, author-only comment edits, membership/Origin/account guards or genuine revocation cleanup.
- Cover project/task/subtask and inactive-ancestor cases where applicable. Refresh after Restore makes current work controls available or presents an explicit safe conflict/reload action; it must not require dismissing the whole editor. Old generation/account callbacks cannot unlock a newer inactive target or clear its pending lock.

## Verification and completion

Add desktop/Android regressions for the same mounted editor through active → Trash → Restore → Refresh, with independent work and comment drafts. Assert the stale warning clears, work controls recover, original input/revisions are retained and an explicit stale save cannot overwrite newer saved work. Also test failed/delayed refresh, target/account changes, genuine membership loss and permanently read-only Trash detail. Keep the existing navigate/reopen restoration case and reviewed task 013 history behavior.

Run README lint/types/build plus focused activity/Trash/session/history/navigation regressions and final integrated browser checks on final sources. Server/schema are unchanged unless the chosen fix demonstrates a need; distinguish carried backend/migration evidence from new runs. Record actual counts/limits in task 014 and the main handoff, leaving independent re-review pending. Stage only task-owned changes, provide a commit message and leave commit/push/deployment to the owner. No checklist/shopping/status implementation or production/provider action is assigned here.


## Combined assignment — 2026-11-14

The owner explicitly assigned tasks 014–018 together and chose "Implement all five, then return them for coordinator review." Implementation proceeds in dependency order; intermediate independent-review gates are deferred for this assignment, not claimed passed. The prior staged implementation/specifications are preserved. No subagents, commit/push, deployment or real-provider changes are included. Final combined verification and per-task completion evidence remain pending.

## Correction implementation — 2026-11-14

The activity panel now reports both authorized read-only and active states to its parent, including continuation loads. EntityEditor reconciles availability in both directions and prevents older initial work-context replies from overriding a newer activity result. Failed/obsolete/account-mismatched callbacks cannot unlock work; explicitly read-only Trash detail remains read-only. No draft text, original base revision, uncertainty or conflict is rebased by activity refresh.

New desktop/Pixel 7 regressions cover the same mounted project/task/subtask editor through inactive ancestors, failed refresh, Restore, resumed controls and a stale explicit Save409 with work/comment input intact. A held old active-target response cannot unlock another inactive target. These passed in the earlier focused combined regression run; final full integrated evidence follows in the combined completion record. Independent re-review remains pending, deferred by the owner's combined assignment rather than claimed passed.


### Verification shared by this candidate

Actual process-only local test-port override: `node .local/task014-command.mjs integration` / `browser …` (README equivalents `npm test` / `npm run test:e2e`). The guarded test database uses loopback 15432 because Windows reserves saved 55432; saved `.env`/`.env.test` values are unchanged. No reset/truncation or live-server/provider action occurred.

- Prisma client generation and schema validation passed on the final schema (7.10.1; no dependency/version changes).
- `npm run check` passed, including lint and strict types; final Webpack build passed. Default Turbopack, npm install/audit and Linux/container runtime were not rerun for this assignment.
- Final backend run: **128/128 tests, 13 files, 25.64 seconds, exit0**. New list HTTP coverage has5 scenarios; combined workflow/tag/order HTTP coverage has8. Existing activity9 and prior auth/invitation/session/membership/planning/Calendar/Trash checks are included.
- Fresh guarded database applied all 14 migrations; populated014→015→016–018 preservation/drift proof passed. Original full row digests across 18 populated014 tables and 23 populated015 tables survive; only newly added nullable activity subject fields were excluded where appropriate. A populated intermediate boolean implementation migrates Important/Urgent true values to ordinary tags with original work revisions/timestamps retained. Development upgrade retained original 18-table digests. Fresh/upgrade clusters 15434/15435 were stopped afterward. Ignored proof scripts/logs/databases are local artifacts, not application files.
- Final full integrated browser run: **135 passed / zero failures / three intentional Android mouse-only skips, 138 total, 30.2m, exit 0**. Both desktop Chromium and Pixel 7 profiles are included; [combined handoff](../handoff.md#combined-verification-record). This is a complete run on the final application and corrected test sources, separate from all earlier focused/interrupted attempts.

Limits: desktop Chromium and Pixel7 touch emulation, no physical Android; no Ubuntu/proxy/TLS/Mailcow or real SMTP delivery verification, commit, push or deployment. Configuration history shows latest 50 events. Drafts/filters are account-bound memory, not durable offline edits. Intermediate independent review was explicitly deferred by the owner; coordinator review remains pending.

Final cleanup: the owned portable PostgreSQL verification cluster and application/SMTP fixtures were stopped; no listeners remained on their verification ports. Final lint/types and schema validation passed again after the test-only fixture corrections. All candidate changes are staged for owner commit/coordinator review; no commit, push or deployment was performed.
