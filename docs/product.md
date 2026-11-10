# Product scope

## Confirmed direction

- Kanban boards, project planning, subtasks, and configurable calendar time blocks.
- Create a block, such as noon to 3 PM, then assign a project or task through dragging or explicit controls.
- Simpler chores/checklists, task brain dumps, and notes.
- Desktop and Android support; iPhone is not an initial target.
- Personal and shared workspaces with tasks and projects. Users can toggle which workspaces the calendar and board display.
- Shared projects in the first version, through shared workspace membership.
- Fixed task statuses initially; custom statuses can be considered later.
- Online-only editing initially; offline editing is deferred.
- Host on the owner's always-online Ubuntu server. Docker is expected but unverified.
- Password confirmation during account creation and automatic recovery links, using owner-configured SMTP.

## Recommended initial statuses

The following names are the recommended implementation baseline.

| Stable ID | Display name | Meaning |
| --- | --- | --- |
| backlog | Backlog | Possible future work, not yet committed to the ready queue |
| todo | To do | Ready and intended to be worked on |
| in_progress | In progress | Work has started |
| blocked | Blocked | Cannot proceed because of a dependency or obstacle |
| done | Done | Completed |

All workspaces share these definitions initially. Only Done means completed. Scheduling is independent of status. Inbox captures become tasks explicitly; unprocessed notes do not automatically become Backlog cards. Archive/deletion are separate lifecycle operations.

## Proposed defaults

These are recommendations, not additional user-confirmed requirements.

- Build a standalone planner; keep SilverBullet optional, beginning with links to reference notes.
- Give each user a private personal workspace and allow multiple shared workspace memberships. Start with owner/editor roles.
- Workspace membership is the only sharing boundary initially. Project-level exceptions and private items within shared workspaces are deferred.
- Every record belongs to one workspace. A task may have no project but still has a workspace.
- Persist user-selected workspace sets per view. Board already has its own selection; task 009 adds a separate Calendar selection. Keep active filters visible and show workspace names on entries.
- Shared workspace blocks are visible to members; personal workspace blocks are private. Privately scheduling shared tasks across workspaces needs a separate design decision.
- Creating work with multiple workspaces selected requires an explicit destination or clearly displayed default. Filters must not silently assign ownership.
- Use one canonical task across project, board, list, and calendar views.
- A block is empty or references one project/task in its workspace. Many blocks may reference the same work.
- Start with simple project planning notes rather than a full knowledge-management editor.
- Live push/presence is optional. Shared edits still persist correctly and conflicts must be visible.

## Core behavior

- A project task appears on the board without copying it. Card moves update status everywhere.
- The combined board groups accessible tasks under the five standard columns and preserves their workspace identity.
- Filtering changes visibility, not membership/data. Clearing all selections shows an explicit empty state.
- Scheduling does not start/complete work. Removing a block does not delete the linked task/project.
- Due dates, planned work time, and actual time worked are distinct.
- Essential actions work without dragging. Android needs explicit scheduling controls and a usable day/agenda view.
- Saves require a connection. Show pending/saved/failed/conflicting states with recovery controls. Durable offline queues are deferred.
- Removing membership stops future server reads/writes; it cannot remove information already downloaded or seen.

## Implemented planning defaults (task 005)

Task 005 uses the proposed workspace ownership boundary and canonical task model. These bounded implementation defaults are not additional user-confirmed requirements: plain-text project/task descriptions; titles of 1–200 trimmed characters; descriptions up to 20,000 characters; default task status `todo`; standalone tasks; one subtask level; independent parent/child completion; and immutable workspace/project/parent assignments after creation. Shared owners and editors have equal content-editing rights. Create/read/update are available; moving, deleting, archiving, due dates, and assignment remain deferred.

Projects selects one explicit workspace locally to that view, independent of future board/calendar selection. Manual refresh fetches shared changes. Conflicts require comparing a saved version with the retained draft and explicitly choosing which to keep before another save. Draft retention lasts only within the signed-in planner session; document reload/close or sign-out discards it. There is no offline queue.

## Implemented board defaults (task 008)

Board displays canonical tasks/subtasks individually under the five shared statuses, with workspace/project/parent context and independent completion. Selection is account-owned/server-saved and local to Board: first visit selects only personal, explicitly cleared selection persists empty, and same-user tabs use last-committed selection. These are bounded implementation defaults, not new sharing policy. Workspaces are still authorized for every task operation regardless of preferences. Ordering is creation-time/ID; same-column drops do not reorder. Desktop mouse dragging and explicit keyboard/touch selectors update status only. Android uses status tabs. Manual refresh, incomplete-load warnings, explicit conflict review, and retained Projects draft revisions are part of the contract; live push remains deferred; Calendar has its independent contract below.

## Implemented Calendar defaults (task 009)

[009: Calendar time blocks](tasks/009-calendar-time-blocks.md) implements workspace-owned, one-off timed blocks: empty or linked to one project/task in the same workspace, with independent Calendar filters and an account-saved display time zone. Shared workspace members can read/edit shared blocks; personal blocks stay private. Overlaps are allowed initially, pointer snapping is 15 minutes, and explicit controls accept other minute values. UTC instants, visible IANA zones, explicit DST ambiguity handling and revision checks define scheduling. Block removal leaves canonical work intact. Private scheduling of shared work, recurrence and availability booking remain deferred. These bounded implementation defaults remain subject to evaluation; they are not additional user-confirmed requirements. Saves/assignment/removal are revision protected, create retries reconcile the original intent, drafts are account-scoped in memory, and refresh is manual.

## HTTPS preview access (task 010)

The owner chose an HTTPS subdomain through their existing reverse proxy, with LAN/VPN access to server `10.0.0.95`, and requested accounts for other preview users. Task [010](tasks/010-https-preview.md) adds an explicit HTTPS preview signup mode/flag; it does not configure the actual server or proxy. Disabling the flag closes signup while retaining sign-in. Signup alone grants only a personal workspace; shared access still requires owner-granted membership. Task 012 adds the later invitation-only policy below; read-only viewers and general email verification for existing/publicly registered accounts remain unimplemented.

## Planner usability (task 011)

Task [011 implementation](tasks/011-implementation.md) delivers the requested sidebar creation default, shared responsive editors, compact Projects hierarchy, whole-card Board dragging/project colors/filters, Calendar drag preview and one-hour blank-slot scheduling. Coordinator review is pending; see the handoff for actual verification and limits. These contracts supersede the earlier per-view editing/time-zone presentation described above.

The sidebar default is saved per account, initializes to personal and falls back there after membership loss. Projects browses that workspace. Board and Calendar keep independent saved visibility selections. Editors show immutable existing ownership and constrain new work to its project/parent/assignment workspace. A default outside a view's selection is explicitly labeled, with a Show creation workspace action. No record transfers are implemented.

Project/task/subtask/block editors share native modal behavior: clean dismissal, dirty Keep editing/Discard changes confirmation, disabled dismissal while pending, and an explicit Keep draft for later action. Retained drafts remain discoverable and keep original revisions across planner navigation; they are memory-only and disappear on document reload or account changes. Calendar creates reconcile stable intent keys; project/task creates retain input but do not have a create-intent ledger, so an unconfirmed new-work create must be checked before retrying. Status moves and ordinary edits never silently rebase a draft.

Board cards show project/parent context and use stable identity-derived color tints. Desktop mouse dragging changes status; touch scrolling/tap and keyboard opening use the same task editor. Workspace/project (including Standalone), inclusive creation/edited dates, title search and Hide Done are available in an Apply/Cancel filter dialog. Only workspace selection persists across devices; other filters and hierarchy expansion persist during same-account planner navigation. Counts cover every loaded record; failed scopes are explicitly incomplete.

Users enter/view/edit schedules in their own saved IANA zone. User settings owns that preference; the previous Calendar zone is migrated once. Each workspace has a separate canonical reference zone, with equivalent local dates/clocks derived from the same UTC instants. On 2026-11-08 the owner approved owner-only revision-checked zone changes, explicit UTC backfill for existing workspaces, and the saved user zone as the visible initial default for newly created shared workspaces (UTC before a saved choice; the create form can use its detected browser fallback). Personal bootstrap uses UTC before the user has chosen settings. Settings changes never move schedules or reinterpret unfinished drafts. The server location is irrelevant.

Calendar uses the shared block overlay, event/agenda activation, New block, desktop slot activation and explicit Schedule work buttons. Desktop dropping work onto blank visible time creates one idempotent block of 60 elapsed minutes; dropping onto an existing empty block assigns it without changing its ID/interval. Occupied/foreign foreground events reject implicit replacement. Named zones, gap rejection and explicit repeated-time choices remain required. Scheduling never changes work status/revision. No recurrence or cross-workspace work references are added.

## Decisions still open

- Final acceptance of the recommended stack; verification of Docker and existing reverse-proxy configuration.
- Whether viewer-only access or further login methods are needed. Account invitation policy is confirmed below.
- Whether personal scheduling of shared tasks is needed initially and its exact visibility rules.
- Recurring chores/checklists and whether checklist items are independently schedulable tasks.
- Longer-term overlap/availability and snapping policy (task 009 implements overlaps allowed and 15-minute pointer snapping initially); project/task deletion/archive behavior remains undecided.
- SilverBullet's role and whether linked notes are sufficient.
- External calendars, notifications, and actual time tracking are uncommitted follow-ups.
- Any future ability to move existing records between workspaces; task 011 preserves immutable ownership and has owner-approved zone initialization/permissions.

## Invitation-only signup (task 012)

On 2026-11-09 the owner chose account-only email invitations, administered only by existing accounts explicitly listed in the server's `INVITATION_ADMIN_EMAILS`. Configuring that list closes public signup even if a previous preview flag remains enabled. An invited recipient creates an account through a single-use, seven-day email link and signs in to their own personal workspace. Shared access is granted separately through existing workspace management. Neither workspace ownership nor accepting an invitation grants invitation-administrator privileges. The implementation record is [012](tasks/012-account-invitations.md); independent review is pending.

## First complete workflow

A user signs in to a personal workspace and joins a shared one. An owner creates a shared project/task; an editor changes its status and assigns it to a block. Desktop and Android can display the personal workspace, shared workspace, or both on the board/calendar. An unrelated account cannot fetch or modify either workspace's data. Failed/conflicting saves are visible and recoverable.
