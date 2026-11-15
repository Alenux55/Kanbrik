# 017: Preserve tags during Board recovery and migrated-tag edits

Status: Both corrections implemented on 2026-11-15 above `3287adc`, preserving the coordinator's staged review documentation. Verification is recorded below; independent re-review is pending. Hold import/deployment until re-review. The original task 014 restored-editor P2 remains independently closed.

## Outcome and inputs

Correct two tag integration defects while preserving the delivered comments, lists, workflows, ordering and Calendar preview. Read AGENTS.md, README, product/architecture, [task 017](017-important-urgent-filters.md), [task 019](019-calendar-drop-preview.md) and the current [handoff](../handoff.md). Use the current committed candidate; do not reset to the earlier approved baseline or rewrite applied migrations.

## P2: A failed Board move can clear the task's tags on recovery

Location: `src/components/board.tsx:485–495`, consumed by `src/components/entity-editor.tsx:213` and `PlanningDraft` in `src/components/planning-drafts.tsx`.

Board's proposed status draft stores `tags: task.tags`, but the canonical editor draft/save contract uses `tagIds`. The proposal remains after an HTTP error, transport failure or conflict. Opening it does not use the record's initial tag selection because a retained draft already exists. The next explicit save sends `tagIds: []`, removing unrelated associations during status recovery. Conflict recovery that keeps the proposed draft has the same missing field.

Independent reproduction used a real desktop mouse gesture and a disposable account on owned loopback port 3115:

1. Create a task in To do with one selected tag.
2. Intercept its Board status PATCH with HTTP 503 before a server write; drag the whole card to In progress.
3. Open the retained unsaved draft. The existing tag is no longer selected.
4. Choose Save changes. The server returns 200, status becomes `in_progress`, and the task's tag count changes from 1 to 0.

Ignored reproduction: `.local/review-latest-board-tags.mjs`. Observed result: `blockedWrites=1`, `originalTags=1`, `selectedTagsInRecovery=0`, `retryStatus=200`, `savedTags=0`. Its account/records and owned app are removed in cleanup. This is an additional failure outside the passing supplied regression selection.

Required correction:

- Populate the canonical retained tag-ID selection when constructing Board proposals. Prefer an explicit `PlanningDraft` annotation or checked construction so DTO-only fields cannot silently replace draft fields.
- Preserve all selected tag identities, including existing archived associations. Do not automatically adopt a collaborator's newer task revision or overwrite their tag edits to resolve a conflict.
- Keep current dirty-draft protection, visible failed saves, explicit conflict review, session/account isolation, workspace ownership and status-only successful-drop behavior.
- Check other producers of `PlanningDraft` for this same representation mismatch; keep any correction within the tag/draft contract.

## P2: Migrated tag identities are not encoded in edit paths

Location: `src/components/task-tag-editor.tsx:84`; stable migrated identities originate in `prisma/migrations/202611140006_custom_tags/migration.sql:13–16`.

The migration intentionally generates `legacy-important/<workspaceId>` and `legacy-urgent/<workspaceId>`. The tag editor interpolates `tag.id` directly into `/tags/${tag.id}`. A slash becomes an extra route segment, so rename, recolor, archive and unarchive cannot reach the tag handler. Newly generated UUID tags are unaffected. This affects the documented populated intermediate-boolean upgrade path; an installation without true legacy flags does not acquire these migrated definitions.

Independent reproduction inserted one tag with the exact migration ID shape into the owned fixture workspace, opened Manage workspace tags, renamed it, and saved. The normal UI PATCH returned 404 and retained the original name. An otherwise identical authorized PATCH using `encodeURIComponent(id)` returned 200. This verifies route construction; it is not an independent rerun of the migration/preservation proof.

Required correction:

- Encode the tag identity as one URL path segment when constructing routes, and check other dynamic tag-ID paths. Keep the existing stored IDs, references, history and receipt identities unchanged.
- Do not change or reapply the committed migration, purge/recreate tags, or treat this record-level 404 as workspace revocation.
- Preserve tag draft retention, account guards, revisions and failed-save feedback.

## Acceptance and verification

1. Add a real Board-drag regression for a tagged task whose status save fails before commit. Open the retained editor, confirm its tags remain selected, retry explicitly, and verify only status changes. Cover multiple tags and an existing archived association.
2. Cover a 409 from a newer collaborator edit and a committed/lost-response move. Explicit review must retain the proposed tag selection, preserve revision safeguards and avoid silent tag removal or duplicate status history on reconciliation. Keep unrelated work/comment/list input intact.
3. Exercise migration-shaped Important and Urgent tag IDs through normal UI rename/recolor/archive/unarchive, including desktop and Android explicit controls. Verify the handler receives the original ID and associations/task revisions/history remain correct. Include the identity in upgrade verification rather than testing UUID-only definitions.
4. Run README lint/types, Webpack build, meaningful tag/draft/backend checks and affected Board/tag/session/history browser cases. Use the guarded disposable database; this review's local process-only port adaptation remains 15432. Retain task 019 preview behavior and the original task 014 regression.
5. Record actual commands/counts and limits here and in the handoff, stage only correction-owned files, and return for independent re-review before import. Owner handles commit/push/deployment. No new feature, dependency, schema migration, provider change or broader redesign is expected.

## Review evidence

At `3287adc`, coordinator lint/types, schema validation and Webpack build passed; all 14 test migrations were applied with none pending. Complete backend rerun passed **131/131 checks across 14 files in 26.37 seconds**, exit 0. The first attempt overlapped the build: six fixture-start hooks failed, with 44 passing checks and 87 pending; it is not counted as a successful run. The rerun began after the build completed.

Focused browser run passed **28 cases / zero failures / four intentional Android mouse-only skips, 32 total, 7.0 minutes, exit 0**. Selected files were `activity.spec.ts work-lists.spec.ts workflow.spec.ts task-labels.spec.ts task-order.spec.ts calendar-drop-preview.spec.ts`. The exact `--grep` selection was:

```text
restores the same mounted|obsolete active refresh|checklists and shopping|uncertain list|owner configures|retirement preserves|uncertain workflow|Scoped custom tag|explicit tag creation|sibling moves|uncertain order|filtered or incomplete|live blank-slot|empty-block assignment|clipped cross-day|filter/range/session
```

This includes both original task 014 cases and the affected feature scenarios on desktop/Pixel 7; four preview cases intentionally run desktop only. Fresh week/clipped preview screenshots were inspected. The separate fixture harness reproduced both P2 findings after these scenarios were selected; the passing supplied selection lacks those two regressions. Earlier implementer full-suite and fresh/populated-upgrade proofs remain carried evidence; this review does not claim another full browser run, fresh/upgrade preservation proof, physical Android or Ubuntu/proxy/provider verification. Runtime fixes are not part of this documentation-only review. Cleanup is recorded in the current handoff.

## Correction implementation — 2026-11-15

Both source corrections are implemented above `3287adc`. Board's status proposal is explicitly typed as `PlanningDraft` and copies all existing association IDs into `tagIds`, including archived definitions. It retains the original revision. The canonical editor remains the only other work-draft producer and already uses `tagIds`; inspection found no additional mismatched producer. Successful Board moves still send only status/workspace/revision. No conflict is silently rebased and no collaborator edit is automatically overwritten.

`TaskTagEditor` now applies `encodeURIComponent` to the original tag ID when building the metadata mutation path. This is the only dynamic production tag-ID request path. IDs, associations, receipts, migration files and historical data are unchanged. Existing draft/session/revision/error boundaries remain authoritative; no dependency, API/schema migration or policy change was added.

### Added regression coverage

- Three real-mouse Board cases: 503 before commit, a real shared-workspace editor's newer text/tag edit causing 409, and a committed move followed by an aborted response. Each starts with multiple tags including an archived association, checks the retained selections and original revision, explicitly reconciles where necessary, verifies the final associations and exactly one actual status-change event, and confirms unrelated work/comment/list input survives. The collaborator case deliberately reviews then includes the newer tag/text; the lost-response case loads the already saved version without another status write.
- Normal UI edits for both exact migration-shaped IDs: rename/recolor, archive and restore on desktop and Pixel 7 emulation. Requests must contain one encoded segment and return the original ID. Associated task rows, revisions, timestamps, tag links and work history remain unchanged; the renamed selections survive reload.
- One new backend scenario exercises encoded IDs, ordinary editor permission, outsider/foreign-workspace rejection, stale revision rejection and linked-record/history preservation. Full backend/unit count increases from 131 to 132 across the same 14 files.

### Verification performed

- `npm run check` passed lint and generated Next/TypeScript checks after the typed proposal accounted for the existing optional DTO `tags` field.
- `npm run build -- --webpack` passed on the corrected application source before starting test app fixtures.
- Guarded test migration deploy found all 14 applied, none pending. No new migration was added.
- Full guarded `integration` command, equivalent to README `npm test`: **132/132 tests, 14 files, 28.65 seconds, exit 0**. This includes the new encoded-identity backend scenario and all earlier tag, status, history, permissions, session and Calendar coverage.
- The new desktop regression file passed **4/4 in 1.1 minutes, exit 0** after fixture corrections. Final affected integrated browser results are recorded below separately.
- Repeated the populated intermediate-boolean upgrade proof in a new owned cluster on loopback 15434. Original rows across 18 populated task-014 tables and 23 populated task-015 tables were preserved, both true flags became tags, retained Trash/status/order behavior stayed correct, and Prisma reported no schema drift. Added assertions require exact `legacy-important/<workspaceId>` and `legacy-urgent/<workspaceId>` association IDs, matching the UI/backend fixtures, with lossless single-segment encoding. The ignored `.local/task017-review-upgrade-check.mjs` and proof JSON record this run. The owned upgrade cluster was stopped. No applied migration was modified or reapplied to an existing deployment.

### Earlier attempts and limits

The first new browser run passed the Android migrated-ID case but failed all four desktop cases: populated textarea label locators did not find the already-present editors/input, and rapid subsequent metadata editing used an older revision before the refreshed archive state appeared. The second run passed migrated-ID editing on both profiles but retained the three textarea-locator failures. The corrected fixtures use textbox accessible names and wait for visible refreshed archive state. The third desktop run passed all four cases. None of the failed attempts is counted as a pass; no additional application defect or history/revision bypass was introduced to make those fixtures pass.

The original coordinator findings and evidence above are preserved. Current checks use the guarded disposable database through the existing ignored process-only 15432 URL adapter because Windows reserves saved 55432. Saved environment files, credentials and live Ubuntu/provider configuration remain unchanged. Physical Android, Ubuntu/proxy/TLS/Mailcow, real SMTP delivery, container execution, fresh dependency installation/audit and the default Turbopack build were not tested by this correction. Earlier complete browser results remain carried evidence; independent re-review is required before import/deployment. No commit, push or deployment was performed.

### Final affected integration and handoff

Final affected browser result: **29 passed / zero failures / five intentional Android mouse-only skips, 34 total, 7.5 minutes, exit 0**. All three new held-mouse Board recovery cases passed on desktop; migrated-ID UI edits passed on desktop and Pixel 7. The selection also passed existing Board/session/filter flows, ordinary/dirty/pending editor history, both original task 014 restored-editor regressions and live/clipped DST Calendar preview cases. The five skips are the three new Board drag cases and two Calendar mouse-preview cases on Android; explicit Board controls run there. This is the affected selection, not another full-application browser run.

Command, using the inspected ignored guarded process-only adapter for this checkout:

```powershell
node .local/task014-command.mjs browser tag-recovery.spec.ts board.spec.ts task-labels.spec.ts dialog-history.spec.ts activity.spec.ts calendar-drop-preview.spec.ts --grep 'Board.*recovery preserves|migration-shaped|compact cards|board retains|board ignores|Scoped custom|custom tag edits|explicit tag creation|ordinary editor|dirty Back|Back during|restores the same mounted|obsolete active refresh|live blank-slot|clipped cross-day'
```

The portable README equivalent is `npm run test:e2e --` with the same file/grep arguments after guarded test configuration/migrations and a successful build. Backend command was `node .local/task014-command.mjs integration` (README `npm test`); migration command was the same adapter with `migrate`. Build and check used the README npm commands directly. Earlier coordinator 131-backend/28-browser results and earlier implementation full-suite results remain separate carried evidence.

Proposed commit message: `fix: preserve Board recovery tags and encode tag edit paths`. Both runtime fixes, regressions and updated handoff are staged together with the coordinator's preserved review documents. Owner commits/pushes and arranges independent re-review; the import/deployment hold is not lifted by implementation verification.

Final cleanup: `npm run check` passed again on the final source/tests. The owned verification database and app/SMTP fixtures were stopped, and no listeners remained on verification ports including 15432/15434. All 12 source/test/documentation files are staged, including the preserved coordinator review changes; no credentials, environment files, generated output, local databases or test artifacts are staged.
