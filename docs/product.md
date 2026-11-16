# Product scope

## Confirmed direction

- Kanban boards, project planning, subtasks, and configurable calendar time blocks.
- Create a block, such as noon to 3 PM, then assign a project or task through dragging or explicit controls.
- Simpler chores/checklists, task brain dumps, and notes.
- Desktop and Android support; iPhone is not an initial target.
- Personal and shared workspaces with tasks and projects. Users can toggle which workspaces the calendar and board display.
- Shared projects in the first version, through shared workspace membership.
- Workspace-specific configurable statuses (task 016), starting with the original five definitions.
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

Each workspace starts with these definitions; only seeded Done starts completed. Task 016 makes its saved workspace completion metadata authoritative after configuration. Scheduling is independent of status. Inbox captures become tasks explicitly; unprocessed notes do not automatically become Backlog cards. Archive/deletion are separate lifecycle operations.

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
- The combined Board labels each workspace workflow separately; moves preserve workspace identity.
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

Task 008 initially displayed canonical tasks/subtasks under five shared statuses; task 016 now uses each workspace's saved workflow, with workspace/project/parent context and independent completion. Selection is account-owned/server-saved and local to Board: first visit selects only personal, explicitly cleared selection persists empty, and same-user tabs use last-committed selection. These are bounded implementation defaults, not new sharing policy. Workspaces are still authorized for every task operation regardless of preferences. Ordering is creation-time/ID; same-column drops do not reorder. Desktop mouse dragging and explicit keyboard/touch selectors update status only. Android keeps active columns in contained horizontal workspace groups. Manual refresh, incomplete-load warnings, explicit conflict review, and retained Projects draft revisions are part of the contract; live push remains deferred; Calendar has its independent contract below.

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

## Implemented mobile planner and reversible deletion (013)

On 2026-11-13 the owner requested a visible mobile Calendar, scrolling through all Board statuses instead of selecting each tab, deletion of projects/tasks/subtasks, and a short Calendar Remove action that preserves work. They explicitly chose deleting contained tasks/subtasks together and requested Trash/Restore so this is reversible. [Task 013](tasks/013-mobile-planner-and-trash.md) records the implementation and verification; coordinator review remains pending.

Implemented bounded defaults: mobile day time grid with an agenda alternative; horizontal Board column scrolling; workspace-scoped Trash under existing owner/editor content rights; no automatic purge or permanent-delete UI; scheduled blocks remain visible with a Work in Trash state and retained links, allowing Restore to recover context without recreating removed/reassigned blocks. These implement the task recommendations; they are not additional owner-confirmed requirements. The earlier deletion deferral is superseded by this assignment; permanent purge, retention and work moves remain unassigned.

Further confirmed Calendar requirements: remove the separate Schedule [work] box, click the main work card to edit that project/task/subtask, drag the same card to schedule directly, and do not open a block editor on drag release. Deliberate single-click/tap/keyboard activation opens an editor. Task 013 preserves New block/work selection for non-drag scheduling and retained gesture proposals with an explicit Review action; no failure or DST ambiguity may be silently treated as saved.

## Implemented comments and edit history (014)

The owner requested Comments and Edit history on canonical projects, tasks and subtasks, including original posting and last-edited times. [Task 014](tasks/014-comments-and-edit-history.md) implements these sections in the shared Projects/Board/Calendar editor and authorized read-only Trash detail. Independent review on 2026-11-14 requires [one editor-state correction](tasks/014-review-fixes.md) after an in-place Restore before acceptance; the feature is implemented, but that P2 remains open.

Adopted implementation defaults remain recommendations rather than additional owner-confirmed policy: plain text of 1–10,000 trimmed characters; all current workspace members can read/post; only the authenticated author with current access can edit their comment. Posting does not change a task's content revision or status. Comments retain their posted time; only actual text edits acquire an edited time. Separate comment drafts survive planner navigation in the current signed-in session and participate in Keep draft/discard and pending-close guards; failed saves remain unconfirmed. Reload/offline editing is not supported.

Edit history records trusted actor names, UTC times and actual before/after values for work creation, title/description/status changes, comment creation/edits and correlated subtree Trash/Restore operations. Unchanged saves, reads, filters, scheduling, failed transactions and create retries add no duplicate content event. Existing work has an explicit recording-availability boundary; earlier changes and original creators are never invented. Trash retains IDs, comments, history and original timestamps; new comment changes wait for Restore. Refresh activity retrieves shared updates without replacing either draft. Rich text, attachments, mentions, notifications, comment deletion, permanent purge and work moves remain outside this assignment.

## Implemented work lists (015)

The owner simplified the feature to independent checklists and shopping lists attached to canonical work. Projects, tasks and subtasks support either/both kinds and multiple named sections. Checklist rows have text/check state; shopping rows have text, quantity, optional workspace vendor and purchased state. They do not create tasks, purchase goods, change status or schedule time.

Adopted implementation defaults, not additional confirmed policy: owners/editors have ordinary content rights; 20 sections/work and 200 items/section including archives; names 100 characters, item text 1,000; shopping quantity defaults to 1 and accepts positive values through 1,000,000 with three decimals; 200 workspace vendors including archives. Lists/items archive reversibly, separately from work Trash. An archived vendor remains readable/retainable on its existing item but cannot be newly assigned. Work, comment, list/item and vendor revisions are independent.

## Implemented workspace workflows (016)

The owner confirmed separate workflows per workspace and adding/editing/removing statuses. Adopted defaults: only the workspace owner configures definitions; 1–50 active statuses, 200 total including retired definitions; names up to 80 characters, active names unique ignoring case. An active incomplete status is the creation default; completion is explicit metadata and may apply to multiple definitions. Existing workspaces retain their five IDs, current status semantics and UTC blocks.

Owners preview exact task/completion impact before confirming. Occupied retired statuses require same-workspace replacements for active tasks. Trash retains its status until Restore explicitly resolves retired choices without rebasing batch member revisions. Retired definitions/history remain readable. Name swaps use an intermediate unused name. The combined Board shows workspace-labeled column groups and rejects cross-workspace drops.

## Implemented custom tags and filters (017)

The owner's revised request replaces Important/Urgent flags with arbitrary tag names, autocomplete and deliberate colors from the existing six-color project palette. Calendar additionally has project and text filters. Important/Urgent are ordinary names. Project colors retain the prior ID-based mapping.

Adopted defaults: workspace-owned definitions under ordinary content rights; 60-character trimmed names unique within a workspace under PostgreSQL lower-case normalization, including archived names; 200 definitions including archives; up to 20 tags/task, none by default and no inheritance. Concurrent same-name creation reconciles to one definition; the first saved color is retained. Rename/recolor/archive has its own revision/configuration history and does not revise every tagged task. Archived associations remain readable/retainable but cannot be newly assigned. Task tag-set changes share the canonical task revision and record IDs plus name snapshots in history.

Each view keeps account-bound memory-only tag filters, with explicit Any/All. Selected identities are evaluated within each task's own workspace; workspaces without selected tags are excluded while filtering. Projects keeps contextual parents/projects for matching children; context is not counted as a match. Board composes its existing filters. Calendar combines project/tag/text categories with AND, filters palette/blocks/agenda consistently and keeps unscheduled matches available. Tags apply only to task-linked blocks. Project-only/empty blocks have no tags. Text covers title/description, displayed project/parent names and block label, excluding comments/history. Clear controls and matching/total counts explain hidden saved work; editors still offer all authorized active choices. Filters never write work or schedules.

## Implemented sibling order (018)

The owner requested root-task order within one project and subtask order within one parent. Adopted shared server order uses ordinary content rights, separate group revisions, mouse handles and explicit Move up/down controls. New siblings append; filtered/incomplete groups cannot reorder. Standalone roots, project order, Board order, reparenting and ownership transfer are excluded.

Restore policy adopted for review: retain inactive slots while reordering only active slots. For A/B/C, Trash B then move C before A stores C/B/A; Restore returns C/B/A. This preserves current active relative order and retained inactive placement. Creation/Trash/Restore advance group versions without revising unrelated work text or invalidating exact Trash member revisions. A lost-response retry acknowledges its original move without applying it over a later move.

## Implemented live Calendar preview (019)

[Task 019](tasks/019-calendar-drop-preview.md) adds a live, noninteractive destination boundary and time label while dragging work. Blank time previews the snapped one-elapsed-hour reservation in the source workspace; an empty same-workspace block previews assignment without changing its interval. Occupied/foreign blocks and retained or pending intents show an unavailable cue. Hover makes no saves and opens no editor. Release uses the same targeting and eligibility as the preview, retaining existing save/recovery behavior.

Labels show the viewing user's zone, full dates and offsets. Clipped highlights retain the full proposed interval; ambiguous or missing local times require explicit Review after release. Stationary-pointer scrolling recomputes feedback; filter/range/work/session changes clear invalidated feedback. Native window resize cancels the existing mouse gesture; a fresh drag uses the resized grid. Authorized work from an unselected workspace retains its earlier scheduling behavior, explicitly labeled hidden by workspace selection. Explicit mobile scheduling and touch scrolling remain available. The combined candidate is independently accepted at `2742d15` after both tag corrections; see [handoff](handoff.md) for bounded verification and carried evidence. No deployment, new touch dragging, scheduling-policy change or offline editing is included.

## Implemented Settings and appearance (020)

Task 020 expands Settings into Account and Workspace sections. Account keeps the user's time zone and adds explicitly saved Light/Dark/System appearance. System is the adopted default and follows the device; explicit modes are server-saved across devices. Unsaved/failed choices remain labeled. The Workspace selector is local to Settings and does not change the creation default or Board/Calendar visibility.

Current members manage tags through a searchable workspace list with named palette colors, lifecycle, create/edit/archive/restore and retained definition recovery. Task editors keep chips and existing-tag autocomplete, with a guarded Create/manage tags link that retains unfinished work/comment/list input. Workspace tag authority is independent of the task that originally opened Settings. The accepted task 020 baseline retained associations on archive; task 021's candidate below adds reviewed removal separately. Owner-only workspace configuration and allowlisted account invitations keep their existing permissions. Appearance uses shared semantic styling without changing canonical colors/ownership, remounting planner state or moving reservations. This implementation was independently accepted at `1f85e8a` on 2026-11-15; see [handoff](handoff.md) for checks and limits. The System/local-selector defaults were adopted from the task recommendations, not a new sharing policy.

## Implemented reviewed tag removal (021)

Task 021 implements Settings removal with a complete active/Trash usage warning, CSV download and explicit confirmation. It follows the owner-confirmed detach-and-archive policy: tasks and other tags remain intact, the same definition/history remain recoverable, and a changed usage snapshot requires another explicit review. Downloads and Cancel do not change work. Members retain their current tag content rights; no new administrator/owner restriction is introduced.

Removal supports at most 500 affected tasks/subtasks and 10,000 total members across affected Trash batches in one atomic action. Larger scopes refuse with no partial work. The retained removal report preserves original task IDs/titles/context and capture/review identity. **Removal reports** lets current members inspect/download it after later edits. Restore the definition, restore work from Trash if necessary, then deliberately select the desired tag in normal editors. Restoring a definition does not automatically reattach former tasks; bulk undo and permanent purge remain deferred. Failed/uncertain actions keep their original review/request for retry; stale work/comment/list drafts retain input and require explicit revision review. Independent feature review passed at `4524fd4`; the separately confirmed baseline authentication P1 [024](tasks/024-auth-form-submission-safety.md) holds deployment. No runtime authentication correction or server action was performed by review.

## Planned compact planner update (022–023)

Requested on 2026-11-15. Tasks 020/021 passed their bounded independent feature reviews; **022–023 remain unimplemented**. Prioritize authentication safety task 024 before further feature work or deployment; no later implementation or server action is implied.

- [022](tasks/022-compact-planner-filters.md) replaces expanded Project/tag checklists with multi-select dropdowns and a search field in a shared compact toolbar, with Advanced for extra controls. Projects gains the corresponding filter layout. The owner accepted a normal placeholder until typing and keeping Hide completed in Advanced. Task 016 already supports several statuses marked completed, e.g. Done and Won't do, independently of their labels.
- [023](tasks/023-calendar-presentation-and-workspace-scope.md) hides palette work from unselected workspaces, puts workspace choice in Advanced and uses creation workspace as the default scope. Project tints match the other pages. Preview resembles the saved event, with title/time inside the proposed block, replacing the large detached caption. Optional Agenda replaces the always-open duplicate section; New block and explicit touch/keyboard scheduling remain available. The owner accepted this accessibility-preserving simplification.

Task 020 adopts account-owned System-default appearance, current content rights for tag administration and local Settings workspace choice. Task 021 adopts existing content rights for removal. Proposed later defaults: immediate basic filters and explicit Apply/Cancel for Advanced; Projects continues to browse the sidebar creation workspace. Calendar adds Follow creation workspace versus custom selected-workspaces mode, preserving old saved arrays/explicit empty as custom and defaulting accounts without prior selection to Follow. These detailed defaults are recommendations, not additional owner-confirmed permissions or data-sharing decisions. Existing filter/date/tag semantics and account-bound draft/revision guards remain in force. The planned Calendar display scope supersedes the earlier hidden-workspace-palette behavior only when implemented.

## Authentication form safety candidate (024)

Task 024 addresses the independently reproduced pre-hydration password-in-URL issue. Sign-in, permitted sign-up, recovery and invitation forms stay disabled while their handlers load and explain when JavaScript is required. Once ready they keep the existing validation, confirmation, pending/retry and account/session flows. An explicit native POST rejection provides a second safeguard when browser/autofill submission bypasses normal controls. It performs no login, registration, reset or invitation acceptance.

The implementation candidate awaits independent re-review; deployment remains on hold, and 022/023 remain planned. No signup/administrator/sharing policy, new auth stack, schema or secret rotation is introduced. Existing reset/invitation link handling stays in place. Verification uses disposable local fixtures, not real credentials or the production server; no actual historical credential exposure was established.
