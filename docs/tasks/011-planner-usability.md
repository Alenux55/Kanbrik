# 011: Planner usability, shared editors and settings

Status: Feedback and proposed design captured on 2026-11-08. Documentation only; no runtime changes implemented. Current application baseline: `0a16f7d` (HTTPS preview support). Deliver the ordered slices below as separate reviewed changes, not one undifferentiated rewrite.

## Outcome and inputs

Make Projects, Board and Calendar easier to scan and edit, with shared overlay editors, a sidebar workspace default, compact cards, usable dragging and account-level settings. Preserve canonical work, workspace authorization, online saves, revision conflicts, uncertain-create reconciliation and account-scoped drafts.

Read `AGENTS.md`, product.md, architecture.md, stack.md, agent-workflow.md and the task 005/008/009/010 contracts. The owner's desktop feedback includes two screenshots: oversized Board cards and a Calendar palette whose scrollbar grows while dragging. Those are reported observations, not proof of a specific technical root cause. Android remains required although this feedback was collected on desktop.

## Requested changes

| Area | Owner's feedback |
| --- | --- |
| Workspace selection | Put the primary workspace selector in the left navigation above Projects. Default creation dialogs to it and keep contextual workspace information/selection in editors. |
| Projects | Replace permanently displayed create/edit forms with overlays. Show compact project rows, expanding to tasks and then subtasks; the disclosure button expands, while clicking the row opens editing. Show parent context in task/subtask editors. |
| Board | Reduce card height; drag the card itself instead of a dedicated handle. Single click opens editing; move the status selector into the editor. Color cards by project. Put workspace/project/creation-date/edited-date filters behind a Filter button. |
| Calendar | Fix the expanding palette scrollbar. Drop work onto an empty day/time slot to create a one-hour block. Use overlays for adding/editing blocks rather than permanent forms below the grid. Dirty overlays ask before discarding on outside click. |
| User settings | Move the preferred time zone out of the Calendar controls into a User settings section that can accommodate future settings. |
| Workspace settings | Each workspace has its own named time zone as its shared scheduling context. The owner clarified that users create/view items in their own zones and times are normalized consistently for the workspace, independent of the server's location. |

## Design recommendations and important distinctions

### Sidebar workspace default

- Use a single accessible selector above the Projects navigation item. On Android, provide the same control in a compact navigation/header area rather than recreating a wide desktop sidebar.
- Treat this as the default destination for new work, not an authorization rule or an automatic ownership transfer. Persist it per verified account; initialize to personal if no preference exists. Validate membership and safely fall back when access ends.
- Projects normally browses the selected workspace. Board and Calendar retain independent multi-workspace visibility filters. Changing the sidebar does not silently rewrite those filters. Display the active scope and destination clearly.
- Creation overlays default to the sidebar workspace and allow another accessible workspace when no parent/assignment constrains it. A project task inherits its project's workspace; a subtask inherits its parent's workspace/project. A block referencing existing work must use that work's workspace. Make these constraints visible rather than silently clearing or transferring linked work.
- **Recommended pushback:** existing records should show their saved workspace as read-only initially. A global default must never replace their ownership. Moving an existing project/task/block between workspaces needs its own relationship, visibility and migration design; it is not a harmless dropdown edit. If the owner wants that capability, scope it separately before implementation.
- If the default creation workspace is outside the current Board/Calendar filters, say so and offer an explicit way to show the saved work. Do not silently create under another workspace or change filters without an indicated action.

### Shared overlay editors

- Reuse one canonical project editor, task/subtask editor and time-block editor from all applicable views. Opening a task on Board edits the same record as Projects; do not maintain separate Board drafts or copied task fields with different revision rules.
- Desktop uses a centered modal with a constrained width/height. Android uses a full-screen dialog or sheet with reachable Save/Cancel actions and an internal scroller. Avoid a tiny desktop modal on a phone.
- Clean outside click, Escape, close button and Cancel can dismiss. With changed input, show **Keep editing** and **Discard changes**, defaulting focus to Keep editing. Apply this consistently across all editors, not only Calendar. A pointer release after dragging must not count as an outside click or card activation.
- While saving, show the pending state and prevent accidental dismissal/duplicate submission. Preserve recoverable input, original revisions, intent keys and existing uncertain-save behavior. Discarding an uncertain draft never promises rollback of an already committed server request.
- Keep conflict review within the editor and require an explicit later save. Background reads/status moves must not rebase a dirty draft. Retained drafts must remain discoverable if the originating row becomes filtered out, a block moves out of range, or the editor is closed while retaining input through navigation.
- Capture account, record, workspace and view context. Account changes clear obsolete overlays/drafts; genuine revocation clears only the affected workspace; a missing record does not erase unrelated drafts. Preserve task 009's deleted-record correction.
- Give dialogs names, initial focus, contained keyboard focus, an inert background and focus restoration to the source row/card or a sensible fallback if it disappeared. Android Back should not bypass dirty-close handling. Use the established UI stack rather than custom incompatible overlay systems.

### Projects hierarchy

- Render a compact list: project → top-level tasks → one level of subtasks. Include a separate Standalone tasks group so work without a project remains visible. Do not add deeper nesting.
- Give each expandable row a separate disclosure control with `aria-expanded`. Row/title activation opens the entity editor; expansion must not also open editing. Use normal nested lists/disclosures unless a complete tree keyboard model is deliberately implemented.
- Project editors show project context; task editors show workspace and project (or Standalone); subtask editors also show their parent task. Provide contextual Add task/Add subtask controls and a main New project/New task action rather than permanent blank forms.
- Keep rows compact with title, status and useful counts. Preserve expansion across edits/refresh within the same account/workspace. Parent/child completion remains independent; a Done parent does not complete its children.

### Compact Board cards and filters

- Show the title, a small project label, subtask/parent context when applicable, and a workspace label when combining workspaces. The column already communicates status; remove repeated status text, the large drag-handle button, inline selector and permanently exposed details UI.
- Whole-card mouse dragging uses a deliberate movement threshold. A click/tap opens the editor; a drag/drop or Escape cancellation must not open it afterward. Enter/Space provides an explicit keyboard opening action. Keep visible pending/error/conflict indicators even on compact cards.
- **Touch recommendation:** retain normal scrolling and tap-to-edit on Android, with a labeled status selector in the editor. Whole-card desktop dragging should not turn ordinary phone scrolling into task movement. Keyboard/touch users retain all actions through that editor.
- Assign project colors consistently using stable project identity and a small reusable palette. Sorting/filtering/new projects must not recolor existing projects. Tasks and subtasks inherit their actual project's color; standalone work is neutral. Repeated colors are acceptable; labels remain necessary. Use readable accents/tints with suitable contrast rather than color as the only grouping cue.
- A Filter button opens a compact desktop panel/popover and a usable mobile sheet. Include workspace, project (including an explicit Standalone option), creation date range and last-edited date range. Recommended small additions: title search and status/Hide Done; avoid adding fields such as assignee, tags or due dates that do not exist yet.
- Show an applied-filter count/summary, matching task counts, Clear filters, and an explicit no-results state. Separate draft filter changes from applied filters; make Apply/Cancel predictable. Preserve the existing saved workspace selection when evolving the filter preference contract.
- Validate project filters against accessible selected workspaces. Define date bounds in the user's display zone: inclusive date selections map to a half-open instant range ending at the next local day's start. Test DST. Last edited refers to the canonical task `updatedAt`, including status moves. Never silently cap data and present complete-looking counts.
- Saving an edit/move can remove a card from the current filters; acknowledge the save and restore focus to a suitable control rather than reporting deletion or failure. Retain parent/project context for a matching subtask even if its parent card is filtered out.

### Calendar dragging and overlays

- Reproduce the scrollbar problem first. Current `Palette` transforms the source button inside an `overflow-auto` container; that is a plausible contributor, not a confirmed diagnosis. Prefer a viewport drag preview/portal outside that scroll container, keeping the source's layout footprint stable. Bound preview size and manage auto-scroll deliberately. Do not hide the symptom by making the calendar unusable or disabling all scrolling.
- Clicking an event opens its editor. New block and explicit slot activation open a creation overlay. Remove always-visible desktop create/edit forms below the grid. Keep the Android day agenda and an optional desktop agenda/list view; its rows open the same editor.
- Support dropping a project/task/subtask onto a blank timed grid slot. Create exactly one block referencing that canonical work, starting at the chosen snapped time and lasting **60 elapsed minutes** by default. Use the existing idempotent create-intent contract. The block belongs to the dragged work's workspace, even if the sidebar default differs; show its workspace in feedback/editor. No work status/revision changes.
- Preserve existing empty-block assignment: dropping onto an empty saved block assigns it, preserves its ID/interval and creates no extra event. Dropping on an occupied or foreign-workspace event must not silently replace its work; explain the explicit editor action instead. Hit testing must distinguish an existing event from background grid time, including scrolled and overlapping layouts.
- Keep the existing overlap policy, UTC instants, IANA conversion and 15-minute pointer snapping. Resolve the slot in the calendar's display zone. A repeated/ambiguous DST time needs explicit occurrence confirmation before committing; a spring gap cannot silently normalize. The one-hour rule applies to a new blank-slot drop, not an existing three-hour block.
- Offer equivalent Schedule controls in the work picker/overlay for keyboard and touch. Existing move/resize, explicit edits, unassignment and revision-safe block removal continue to work. Preserve pending locks and drafts across navigation/range/filter changes; canceled/no-op/obsolete gestures cause no unintended writes.

### User and workspace time zones

The owner clarified the intended model: a workspace represents a location/time zone, while its users may be anywhere. Users enter, view and edit schedules in their own zones; the workspace has one shared canonical zone. This supersedes the earlier proposal to default new-block entry to the workspace zone.

| Purpose | Clarified behavior |
| --- | --- |
| Calendar axis, agenda and ordinary date/time entry/editing | Saved user zone, including when working in a workspace located elsewhere; initial browser-detected zone, then UTC fallback only before a saved choice exists |
| Shared workspace reference | The workspace's explicit IANA zone; derive its equivalent local schedule from the same saved instant |
| Database storage | UTC start/end instants plus workspace ownership, with the workspace's named zone stored separately; never ambiguous unqualified workspace-local wall time |
| Server/OS zone | Does not control conversion, defaults or displayed times |

- Add User settings navigation and a preferred IANA time-zone setting saved per verified account across devices. Leave room for future settings without inventing unrequested preferences now. Remove the editable time-zone field from Calendar; retain a passive display-zone label with a Settings link.
- Migrate the existing saved `CalendarPreference.timeZone` to the user preference so existing users retain their choice. Preserve workspace filters separately. Do not edit applied migrations or silently overwrite a new user setting during an old-client read.
- Add a workspace IANA zone under workspace settings. **Proposed permission:** only the workspace owner changes this shared reference; editors read it and schedule work. Personal workspace settings belong to its owner. Use an expected revision for concurrent workspace-setting edits. New-workspace initialization and existing-workspace backfill need an explicit documented default/owner choice; do not guess from the server's location or move existing schedules.
- On save, resolve the user's dated wall time/offset in their zone to an instant; the workspace-local equivalent is a representation of that same instant, not a second competing timestamp. For example, at hypothetical offsets UTC+01 for a user and UTC−05 for a workspace, user 15:00 = workspace 09:00 = 14:00 UTC. Another user sees their own local equivalent. Use named IANA zones and date-specific rules in actual code, not those fixed example offsets.
- Keep UTC instants authoritative and store the workspace zone separately. PostgreSQL `timestamptz` already normalizes instants to UTC and does not retain the original named zone ([PostgreSQL date/time documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)). This implements the owner's workspace normalization without losing DST information by storing only a local clock reading.
- Evolve the current input/storage API deliberately: `TimeBlock.timeZone` currently records an editing zone. Do not silently reinterpret that historical field as a workspace zone or reparse old instants. Distinguish user input-zone validation from the workspace's canonical-zone metadata, document backward compatibility/migration, and preserve all existing instants and create-intent payloads.
- Display one user-local time scale across all selected workspaces. Show the workspace-local equivalent in block details when useful, clearly labeled. Existing block editors also present user-local equivalents; the former block-editing-zone default is superseded for ordinary editing. Changing settings never moves saved instants or task status. A workspace-zone change can change its reference clock/date representation, not the scheduled moment or another user's clock setting.
- Dirty/pending/uncertain forms retain their captured input zone and request payload until explicitly resolved. A settings change must not reinterpret an unfinished edit. Reject nonexistent user-local times and require explicit choice for repeated times before conversion. Test cross-midnight dates, both users/workspace on different DST transition schedules, and two users editing/viewing the same shared block without changing its instant.
- The user-local entry/view plus workspace-reference model is now owner-confirmed direction. Workspace-setting permissions, initialization/backfill and any advanced override UI remain proposed implementation details. No recurrence, all-day/date-only or cross-workspace scheduling feature is added by this clarification.

## Ordered implementation slices

Use one concrete slice per implementation/review handoff, carrying the contracts below forward. Do not start later slices automatically merely because this master record exists.

| Order | Scope and dependencies | Completion evidence |
| --- | --- | --- |
| A: urgent Calendar drag defect | Reproduce/bound the palette overflow; independent of the redesign and schema. Preserve current assignment. | Real pointer drag near/beyond palette edges leaves palette/document scroll dimensions bounded; valid drop updates the original block only; cancel and touch scroll do not save. |
| B: shared context, settings and editors | Sidebar creation default, account/workspace zones with user-local input/view and UTC storage, preference/API migration, reusable dialog/draft lifecycle. Establish contracts before the per-view rewrites. | Account/workspace isolation, migration/data preservation, agreed owner/editor setting rights, multi-zone/DST/midnight conversions, dirty-close/focus and obsolete/pending response tests. |
| C: Projects hierarchy | Use B's context and canonical editors. | Compact expansion/edit separation, project/task/subtask creation with correct parent/workspace, Standalone group, retained original revisions and desktop/touch workflows. |
| D: Board presentation/filtering | Use B's task editor and stable color contract. | Compact whole-card desktop dragging, click suppression, touch/keyboard editing, stable colors/labels, authorized date/project/workspace filters, counts, no-results and conflict behavior. |
| E: Calendar interaction redesign | Use A's stable drag preview and B's context/settings/block editor. | One-hour blank-slot creation versus existing-block assignment, no duplicate creates/accidental replacement, modal dirty-close, agenda/touch parity, DST and revoked/deleted/obsolete-state regressions. |

Before runtime work, issue the chosen slice with its file ownership, concrete data/API changes, acceptance criteria and tests. Reuse the selected Next/React/PostgreSQL/Prisma/Better Auth/Luxon/dnd-kit/FullCalendar stack. A schema/API contract changing across slices is integrated and reviewed before dependent UI work proceeds.

## Verification and boundaries

- Use README commands and owned guarded fixtures. Add meaningful server tests for new settings/filter permissions and relationships, plus pointer/keyboard/touch browser tests for the new interactions. Verify desktop and Android-sized layouts; record emulation versus real hardware. Keep existing auth, session-cookie, canonical-draft, deleted-block, membership-lock and idempotency regressions.
- For runtime slices, run lint/types, schema/migration checks when applicable, production build, relevant backend tests and a final integrated browser suite after the connected workflow is complete. Do not count screenshot inspection as proof of successful writes. Report failures and focused/full runs separately.
- Existing records, instants, revisions, membership boundaries and work references must survive additive migrations. Filters/defaults/settings never grant access, move ownership or copy tasks.
- No custom statuses, deeper subtasks, record transfers, task/project deletion/archive, recurrence, external calendars, offline editing, viewer roles, registration changes, provider changes or deployment are bundled here. Do not add manual within-column ordering while changing Board dragging.
- This preparation changed documentation only. No app tests were run for it, and the reported scrollbar defect has not yet been independently reproduced in the browser. Screenshots/current code informed the proposed fix direction.

Sources checked for the design: [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) for focus/background semantics; [dnd-kit DragOverlay](https://dndkit.com/legacy/api-documentation/draggable/drag-overlay/) for a drag preview outside a scroll container. These inform implementation, not evidence that the current defect is already fixed.

Stage task-owned documentation and provide a commit message; leave committing/pushing to the owner. Record implementation and actual verification in the assigned slice's completion handoff, not as completed work in this planning record.
