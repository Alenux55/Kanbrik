# 013: Trash recovery navigation correction

Status: Correction implemented and verified from `e4f7bfb`; staged for independent re-review. Independent review of `e4f7bfb` on 2026-11-13 found one P2. Task 014 runtime work waits for this correction and independent re-review. Preserve the delivered mobile, Calendar, Trash and account/permission behavior.

## Outcome and inputs

Following a work editor's Trash link must leave the user on an operable Trash page, with unfinished input retained and pending saves guarded. The route must not remain covered by the source modal.

Read AGENTS.md, README, product/architecture, the coordinator handoff, task 013's implementation/review record, task 011's history correction and task 014's dependency status. Start from committed `e4f7bfb`, not the original `ac30934` planning baseline. No schema, dependency or API change is expected.

## P2: Trash links navigate behind an open work editor

Locations: `src/components/entity-editor.tsx:296–301` (Review workspace Trash), `src/components/trash-action.tsx:246–251` (Open workspace Trash), and the shared editor/navigation lifecycle. `PlannerContext` retains its global `target` across route changes, so changing the URL does not dismiss its modal.

Independent reproduction on desktop and Pixel 7 emulation, using a guarded local test database and owned loopback app:

1. Open a saved task, change its description and move that record to Trash through a separate authorized request, simulating another member's action.
2. Save the stale editor. The record-unavailable message correctly appears without revoking workspace access.
3. Activate **Review workspace Trash**. The URL becomes `/trash?workspaceId=...` and Trash loads, but one `dialog[open]` remains, covering/inerting the destination. A real click on **Restore** is intercepted.
4. Manually choose **Keep draft for later**. Restore then works and the unfinished input is retained. This extra dismissal is currently required for the recovery link to be useful.

The delivered browser case at `tests/e2e/trash.spec.ts:730–734` clicks Open workspace Trash and then explicitly invokes `retained(page)`. That manual dismissal masks the incomplete link behavior; it is not a regression proving direct recovery navigation.

## Scope and acceptance

- Route both links through a supported close-and-navigate flow. Clean input can close directly; dirty/uncertain input must remain retained or receive an explicit preserve/discard choice, without silently dropping a draft or its Trash intent. While an applicable save/Trash request is pending, navigation/dismissal remains guarded.
- Reconcile the dialog's owned history entry before completing real route navigation. A bare synchronous `close(); router.push(...)` can race the helper's asynchronous Back traversal; do not regress task 011 by leaving phantom entries, undoing the new route, reloading the document or broadly rewriting browser history.
- Cover both normal Open workspace Trash and record-unavailable recovery, including activation from Projects, Board and Calendar's canonical work editor. The destination uses the target's workspace and does not change the creation default.
- Once navigation completes, no source dialog remains and the actual Restore button is directly clickable/tappable without an extra Cancel/Close/Keep draft action. Retained input can be reopened afterward. One real Back returns to the previous route, without reopening an obsolete editor or accumulating synthetic steps.
- Preserve keyboard activation, focus restoration, real native Back handling, session gates and account leases. No obsolete completion may close a newer account/target's editor or release its pending lock. Do not solve this by auto-dismissing every editor on every transient session check.

## Verification and completion

Add meaningful desktop/Android regressions that follow each link and operate the destination directly, with zero manual dismissal in between. Exercise clean, dirty, uncertain and pending cases, explicit workspace URLs, retained draft recovery, Back history and a session/account change while navigation is pending. Retain prior Trash/membership/zero-write assertions.

Run README lint/types/build, focused Trash/navigation/history/session/Calendar cases and the final integrated browser suite on final sources. Report actual pass/fail/skip counts and distinguish carried backend/migration evidence from new runs if server/schema are unchanged. Update task 013 and the main handoff with completion and limits, leaving independent re-review pending. Stage task-owned changes and supply a commit message; owner commits/pushes. No task 014 feature implementation, production/provider changes or deployment is assigned here.


## Corrective implementation — 2026-11-13

Implemented from `e4f7bfb`; independent re-review remains pending. The five pre-existing staged review/planning documents are preserved. Task 014 feature work remains unimplemented. No schema, dependency, API, server/provider or deployment change.

### Changes

- Both canonical work-editor Trash links use a shared explicit preserve-and-navigate action. It verifies the current account, guards pending requests and duplicate activation, awaits removal of the dialog's owned history entry, rechecks the mounted editor/lease, closes it and pushes the real workspace route. Work drafts and uncertain Trash intents stay in the existing account-scoped store. Creation defaults are unchanged.
- History release now returns an idempotent completion promise. Existing ordinary close/native Back/effect-replay behavior is retained. If a transfer is canceled after release while the same editor/account remains current, its history slot is reacquired. Failed verification leaves the original editor/input available after Retry. Obsolete account or unmounted-target callbacks cannot complete navigation or touch save locks.
- Transfer focus goes to main content rather than the obsolete source control; ordinary close focus restoration and dirty-discard confirmation remain. Link keyboard/touch activation and pending request guards are covered. The previous Trash test now checks actual editor closure rather than manually invoking Keep draft for later after its link.

### New verification evidence

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed: ESLint and strict Next/TypeScript checks |
| `npm run build -- --webpack` | Passed on corrective runtime sources |
| Existing portable PostgreSQL start / `npm run db:test:migrate` | Started the stopped local instance without reset; eight migrations, none pending on the guarded test target |
| Isolated actual-browser history helper checks | 4/4 passed: effect replay, same-commit replacement, replacement during traversal, release during blocked-Back restoration. Preserved route state and one-Back behavior |
| New desktop navigation cases | Clean/dirty links and unavailable recovery passed from Projects, Board and Calendar, with direct Restore and retained input. Pending saves/uncertain intents passed. The separate failed-session/account-switch case passed after fixture ordering corrections |
| Final focused browser run | 19 passed / 1 intentional Android mouse-only skip, 0 failures, 4.5 minutes; navigation, changed Trash flow, history, stale-save isolation and real Calendar gesture regression |
| Final integrated browser run | `npm run test:e2e`: 93 passed / 3 intentional Android mouse-only skips, 0 failures, 96 total, 20.6 minutes in one complete run on final sources. All 48 desktop cases and 45 Android cases passed |
| `git diff --cached --check` | Passed; correction source/tests/docs staged with the owner’s original review/planning edits preserved |

The added regressions operate Restore directly with zero manual dismissal between following the link and using the destination. They check retained input and conflicts afterward, the target workspace versus creation default, unchanged document identity, bounded history and a real Back to the source. They also cover hidden normal links/disabled recovery links while a save/Trash preview is held, blocked Back during a save, lost Trash responses and same-operation retry after Restore, failed identity verification, and an obsolete held navigation response while a newer account has a pending save.

Earlier attempts are separate from final evidence: the first focused run was stopped after three database-unreachable fixture failures and one later pass as the local instance restarted. A later focused run reported five existing regression passes and three new test failures before interruption. Direct Restore/navigation had worked; the retained textarea assertions used an unsuitable exact-label selector, and the pending normal link was correctly hidden rather than aria-disabled. Those assertions now use the textbox's accessible name and test the actual pending UI; the disabled recovery link is separately exercised with real pointer/touch input. A desktop-only attempt reported three new passes before interruption while the session fixture had not completed. That fixture now waits for its editor and intermediate route, bounds gate/action waits, and the isolated session/account case passed. No recovery, persistence, permission, zero-write or history assertion was removed.

### Carried evidence and limits

The coordinator's `e4f7bfb` backend **106/106** and schema validation, together with the original implementation's task 013 migration/upgrade/drift proofs, are carried results, not new server/schema checks by this correction. The new guarded migration-status command above is separate. Backend/schema/API sources are unchanged. No new dependency audit, default Turbopack build, physical Android, Ubuntu/container, live HTTPS/proxy or Mailcow check is claimed. Mobile browser evidence uses Pixel 7 emulation. Drafts remain memory-only. Owner commits/pushes staged changes; coordinator re-review is required before task 014 runtime implementation.


### Ready for independent re-review

The P2 navigation correction is implemented and verified; coordinator closure remains pending. Both links now leave an operable destination without an extra manual dismissal, retain unfinished input/uncertain intents, and consume the editor's history slot before pushing Trash. Task 014 runtime implementation stays gated on independent re-review. No commit, push or deployment was performed.

Suggested commit message: `fix: close work editors before navigating to Trash`
