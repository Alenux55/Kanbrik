# 015: Basic checklists and shopping lists on work items

Status: Implemented in the combined `186acc9` candidate and included in independently accepted `2742d15` on 2026-11-15 after the tag corrections. See [current handoff](../handoff.md) for coordinator checks, separately carried full-suite/upgrade evidence and limits. No deployment was performed by review.

## Outcome

Projects, tasks and subtasks can have a basic checklist, a shopping list, or both, as distinct named sections. Users can add multiple independent sections when useful. A generic checklist supports steps, packing or other simple items; a shopping list keeps purchase details without making every checklist a purchasing form.

The first version has two fixed list types:

| List type | Row fields | Example section |
| --- | --- | --- |
| Checklist | Item text, checked/unchecked | Installation steps |
| Shopping list | Item text, quantity, vendor dropdown, purchased checkbox | Things to buy |

Users can name the sections and maintain vendor choices. Arbitrary custom fields/types, reusable template configuration and a schema builder are deferred. This replaces the earlier broader design, not an additional feature layered on top of it.

## Dependencies and inputs

Read AGENTS.md, README, product/architecture/stack, agent-workflow and the coordinator handoff, plus tasks 013/014 and their final review records. Preserve canonical work, workspace ownership, reversible lifecycle, shared editors, activity recording, independent drafts/revisions and session/account safeguards. Agree list/item/vendor/API contracts before dependent UI/server implementation.

## Confirmed direction and recommended defaults

Confirmed: basic checklists are separate from shopping lists; either or both can be added to a task. The earlier request also covered projects/subtasks and a vendor dropdown. Retain those targets unless the owner narrows them explicitly. The later simplification supersedes the offered generic custom-field approach.

Recommended defaults (not additional owner-confirmed policy): existing owner/editor content rights apply to lists/items/vendor choices; vendors are workspace-scoped; one work item may have multiple named lists of either type; lists start empty and do not inherit parent/child entries. Shopping quantity defaults to 1 and must be a positive number, vendor may be unassigned and purchased starts false. A checklist item starts unchecked. Use two supported types with typed data, not user-defined fields.

## Scope

### Creating lists and maintaining items

- Provide separate **Add checklist** and **Add shopping list** actions in the shared work editor, each creating a named section. There is no template/configure-fields prerequisite. Each section has explicit workspace ownership and exactly one canonical project/task target; subtasks remain Tasks. Keep stable list/item IDs and display order.
- Checklist items need only text and a checkbox. Users can add/edit item text and check/uncheck it. An optional progress count such as 2 of 5 checked is informational: checking all items does not complete the task or change its status.
- Shopping items have item text, quantity, one optional vendor and a purchased checkbox. Vendor choices belong to the item's workspace. Editing purchasing data does not create an order, make a purchase, change work status or schedule time. Do not show quantity/vendor controls in a basic checklist.
- Lists on different work items, including a project and its subtasks, have independent entries. Adding/renaming a list or editing a checkbox must not edit another work item's values. Do not create separate canonical tasks from list entries or add automatic project-level shopping rollups.
- Users can rename sections. Do not silently convert a populated checklist to a shopping list or the reverse; cross-type conversion is deferred. Choose/document reasonable list/item/name/text/quantity bounds and validate typed values server-side; escape displayed text safely.
- Recommended removal policy: archive items and list sections reversibly, retaining their data behind an explicit restore action; no permanent purge. Keep this local archive separate from moving the canonical work item to workspace Trash. Reopening a work editor must not duplicate its sections/items.

### Vendor dropdown

- Provide a straightforward workspace vendor-choice list, reachable from shopping-list controls or workspace settings. Users can add/rename/archive names using stable IDs. This is a dropdown source, not a vendor CRM; addresses, contacts, contracts, pricing and purchasing integrations are outside scope.
- Renaming a vendor preserves existing references. Archived vendors stay readable on existing items but cannot be newly selected; retaining an existing archived vendor while editing another item property is allowed. Vendor refresh must not replace dirty item input. Reject vendor IDs belonging to another workspace or invalid new assignments to archived vendors.
- Desktop and Android must support adding either list type, editing/checking items and choosing vendors through labeled keyboard/touch controls. Keep long labels/items and shopping fields contained or stacked on narrow screens. No hover/drag-only control or page-wide horizontal overflow.

### Permissions, lifecycle, conflicts and activity

- Enforce current membership and personal/shared predicates on every list/item/vendor read or write, including direct IDs and nested relations. Validate target/list/item/vendor/workspace consistency in the server and database. A forged foreign item or vendor ID must not grant access or create a cross-workspace reference.
- Reuse verified identity, expected-account rejection, trusted mutation Origin, strict input, no-store responses and membership workspace locking/recheck. The proposed rights match ordinary content editing, without a new role or public/global vendor directory.
- Give lists/items/vendor definitions suitable independent revisions and reviewable conflicts. A list edit must not overwrite or falsely revise dirty work/comment content. Updating one item should not resubmit and overwrite the whole collection. Stable create intents or equivalent reconciliation prevent duplicate lists/items after an uncertain retry.
- Draft/pending/failed/uncertain list input participates in the reviewed Keep draft/discard, native Back, explicit Trash navigation and account-scoped lifecycle. Preserve unrelated work/comment/list drafts. Refresh must not replace dirty input; late account/target replies cannot clear a newer draft or save lock.
- Work Trash retains all lists/items and vendor references. Authorized Trash detail is read-only, fresh changes to inactive work are rejected server-side, and subtree Restore exposes the same IDs/text/check states/purchase details. Work restoration must not undo a separate prior item/list archive. Distinguish missing/trashed work from genuine workspace revocation.
- Integrate real list/item changes into task 014 activity transactionally, with actor/time and meaningful section/item before/after values. Extend its event contracts deliberately. Workspace vendor changes need their own authorized configuration record, not fabricated edits to every linked task. Failed/no-op/replayed requests must not create false or duplicate events.

## Acceptance and verification

1. A task can have only a checklist, only a shopping list, both, or neither. Add multiple named sections, demonstrate the same support on projects/subtasks, reload/open another session and verify independent server-backed entries. A checklist never displays vendor/quantity fields.
2. Add/edit/check/uncheck checklist items; add shopping items with quantities, two vendor choices and purchased state. Rename a section/vendor and archive/restore items/lists; original IDs/data remain intact. Archived vendor selections remain readable/retainable but cannot be newly assigned.
3. Real PostgreSQL/HTTP coverage rejects foreign work/list/item/vendor IDs, forged fields, unsupported list types, stale revisions/Origins/account expectations and a member removed while waiting for the workspace lock. Cover rollback, same-intent retries, concurrent item edits and active-ancestor/Trash restrictions.
4. Desktop/Android browser flows cover both list types, simultaneous use, vendors, archive/restore, long content, failed/uncertain saves, shared conflicts and refresh. Verify dirty work/comment/list input, pending dismissal, Back/focus, explicit Trash navigation and obsolete-account replies.
5. Work/subtree Trash and Restore preserve both list types, all item IDs/text/check/purchase values and separate archive states. Read-only Trash detail is usable. Checking every checklist item or every Purchased box produces zero task-status/scheduling writes. Real changes commit the right activity exactly once.
6. Additive migration/client/schema/fresh-target/populated-upgrade checks preserve all earlier work, Trash, Calendar, comment/history data and timestamps. Run README lint/types/build, meaningful backend checks, focused lists plus affected activity/Trash/history/session/Board/Calendar/invitation checks, then the full integrated browser suite. Record actual counts and limitations; do not claim a test pass from this specification.

## Boundaries and completion

This is simple supplemental data on canonical work, not the standalone Lists/chores feature, a custom-field/template builder, an inventory/procurement service or task 016's status configuration. No arbitrary fields, type conversion, prices/budgets, stock tracking, orders/payments, actual purchases, vendor scraping, notifications, automatic inheritance, task creation/scheduling, cross-workspace sharing, permanent purge or offline edits. Document material changes to the recommended permissions/lifecycle defaults before implementation.

Implement after task 014 independent review and any corrections, in bounded slices: shared contracts/migration; checklist and shopping-list sections/items; workspace vendor choices; activity/Trash/draft integration; final verification. Keep actual evidence here, update product/architecture/README only as implemented and leave independent review pending in the completion handoff. Stage task-owned changes and supply a commit message; owner commits/pushes. No production/provider/deployment action. That earlier specification-only revision ran no application tests; actual implementation checks are recorded below.


## Combined assignment — 2026-11-14

The owner explicitly assigned tasks 014–018 together and chose "Implement all five, then return them for coordinator review." Implementation proceeds in dependency order; intermediate independent-review gates are deferred for this assignment, not claimed passed. The prior staged implementation/specifications are preserved. No subagents, commit/push, deployment or real-provider changes are included. Implementation is present; the completion record below distinguishes actual checks and remaining review. No intermediate independent approval is claimed.

Adopted implementation defaults: 20 named sections per work item and 200 items per section (including archived records), 100-character section/vendor names, 1,000-character item text, positive shopping quantities through 1,000,000 with three decimal places, and 200 workspace vendor choices including archives. WorkList/WorkListItem have separate revisions, typed kind consistency and same-workspace foreign keys; create receipts bind current actor, exact payload and target. WorkspaceVendor names are unique among active choices ignoring case. Work-level activity records real list/item changes; vendor configuration uses its own workspace-scoped append-only record. Supplemental input joins the account-bound draft provider, work editor dismissal and target save exclusion. No collection-wide item overwrite or work revision bump is used.

## Completion handoff — 2026-11-14

Implemented both typed list sections on projects/tasks/subtasks, independent rows/revisions, quantity/vendor/purchased controls, workspace vendors, reversible section/item archive, transactional work/configuration history and actor/payload-bound creation receipts. Canonical work, status and schedule are unchanged by list actions. Existing archived vendors remain retainable; fresh archived/foreign assignments reject. Work Trash pauses changes and preserves original IDs/data/earlier archives through Restore.

Supplemental forms participate in account-bound pending/uncertain/conflict/dismissal/Back/Trash lifecycle and target exclusion without overwriting work/comment input. Failed loads preserve drafts. A held completion from another account cannot clear a newer draft or pending lock. New HTTP 5 scenarios cover all target/list kinds, relation/type/Origin/account permissions, noops/retries/concurrent edits/archive/Trash/vendors and injected rollback; shared-lock membership denial also runs in the combined suite. The initial six list/mounted014 cases expanded to include obsolete-account completion; final full browser evidence includes all of them.

Earlier attempts: first vendor browser locator treated a select's accessible name as an exact label; it was corrected to the labeled combobox. This was a test locator issue. No failed/partial run is claimed as a complete pass. Bounds/adopted defaults are recorded above and in product/architecture. No conversion/templates, standalone Lists, stock/orders/payments or automatic status/task/scheduling behavior was added.

### Verification shared by this candidate

Actual process-only local test-port override: `node .local/task014-command.mjs integration` / `browser …` (README equivalents `npm test` / `npm run test:e2e`). The guarded test database uses loopback 15432 because Windows reserves saved 55432; saved `.env`/`.env.test` values are unchanged. No reset/truncation or live-server/provider action occurred.

- Prisma client generation and schema validation passed on the final schema (7.10.1; no dependency/version changes).
- `npm run check` passed, including lint and strict types; final Webpack build passed. Default Turbopack, npm install/audit and Linux/container runtime were not rerun for this assignment.
- Final backend run: **128/128 tests, 13 files, 25.64 seconds, exit0**. New list HTTP coverage has5 scenarios; combined workflow/tag/order HTTP coverage has8. Existing activity9 and prior auth/invitation/session/membership/planning/Calendar/Trash checks are included.
- Fresh guarded database applied all 14 migrations; populated014→015→016–018 preservation/drift proof passed. Original full row digests across 18 populated014 tables and 23 populated015 tables survive; only newly added nullable activity subject fields were excluded where appropriate. A populated intermediate boolean implementation migrates Important/Urgent true values to ordinary tags with original work revisions/timestamps retained. Development upgrade retained original 18-table digests. Fresh/upgrade clusters 15434/15435 were stopped afterward. Ignored proof scripts/logs/databases are local artifacts, not application files.
- Final full integrated browser run: **135 passed / zero failures / three intentional Android mouse-only skips, 138 total, 30.2m, exit 0**. Both desktop Chromium and Pixel 7 profiles are included; [combined handoff](../handoff.md#combined-verification-record). This is a complete run on the final application and corrected test sources, separate from all earlier focused/interrupted attempts.

Limits: desktop Chromium and Pixel7 touch emulation, no physical Android; no Ubuntu/proxy/TLS/Mailcow or real SMTP delivery verification, commit, push or deployment. Configuration history shows latest 50 events. Drafts/filters are account-bound memory, not durable offline edits. Intermediate independent review was explicitly deferred by the owner; coordinator review remains pending.

Final cleanup: the owned portable PostgreSQL verification cluster and application/SMTP fixtures were stopped; no listeners remained on their verification ports. Final lint/types and schema validation passed again after the test-only fixture corrections. All candidate changes are staged for owner commit/coordinator review; no commit, push or deployment was performed.
