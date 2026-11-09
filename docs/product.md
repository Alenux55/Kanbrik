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

The owner chose an HTTPS subdomain through their existing reverse proxy, with LAN/VPN access to server `10.0.0.95`, and requested accounts for other preview users. Task [010](tasks/010-https-preview.md) adds an explicit HTTPS preview signup mode/flag; it does not configure the actual server or proxy. Disabling the flag closes signup while retaining sign-in. Signup alone grants only a personal workspace; shared access still requires owner-granted membership. Read-only viewers, invitations and email verification remain unimplemented.

## Requested usability changes (task 011, not implemented)

Desktop feedback and the subsequent settings request are captured together in [011: Planner usability](tasks/011-planner-usability.md). Requested changes include a sidebar workspace default; overlay project/task/subtask/block editors with parent context and dirty-close confirmation; an expandable Projects hierarchy; compact whole-card-drag Board cards with project colors and a Filter panel; a fix for Calendar palette overflow; one-hour blocks from blank-slot work drops; and moving preferred time-zone editing into User settings. The owner clarified that each workspace has a canonical named zone, while users enter/edit/view schedules in their own zones. The server's location does not determine either.

Recommended distinctions remain proposals: sidebar selection supplies creation defaults while saved record ownership stays fixed, and Board/Calendar visibility filters remain independent. The clarified time-zone model uses the user's zone for the combined calendar and ordinary time entry, with the workspace zone as the shared reference. Keep UTC instants and the workspace's named zone in storage; derive each local representation from that same instant. Settings changes do not move existing schedules or reinterpret dirty input. Whole-card desktop dragging retains tap-to-edit and explicit status/scheduling actions on Android. See task 011 for the full feedback, design tradeoffs and ordered implementation slices. None of these redesigns is claimed implemented here.

## Decisions still open

- Final acceptance of the recommended stack; verification of Docker and existing reverse-proxy configuration.
- Sign-up/invitation process, login method, and whether viewer-only access is needed.
- Whether personal scheduling of shared tasks is needed initially and its exact visibility rules.
- Recurring chores/checklists and whether checklist items are independently schedulable tasks.
- Longer-term overlap/availability and snapping policy (task 009 implements overlaps allowed and 15-minute pointer snapping initially); project/task deletion/archive behavior remains undecided.
- SilverBullet's role and whether linked notes are sufficient.
- External calendars, notifications, and actual time tracking are uncommitted follow-ups.
- Workspace-zone initialization/backfill and owner-edit permissions, plus any future ability to move existing records between workspaces; task 011 confirms user-local scheduling with a workspace-zone reference and recommends preserving immutable ownership for the UI redesign.

## First complete workflow

A user signs in to a personal workspace and joins a shared one. An owner creates a shared project/task; an editor changes its status and assigns it to a block. Desktop and Android can display the personal workspace, shared workspace, or both on the board/calendar. An unrelated account cannot fetch or modify either workspace's data. Failed/conflicting saves are visible and recoverable.
