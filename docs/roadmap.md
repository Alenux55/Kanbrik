# Delivery roadmap

Tasks 001–009 implement the foundation, accounts/recovery, personal/shared access, project/task planning, corrected cross-tab verification, Kanban and Calendar. The Calendar correction passed coordinator re-review at `da206b5`. Task 010 adds the owner's requested HTTPS preview signup/configuration support; actual server/proxy setup remains owner-operated. See handoffs for exact evidence and limits. This sequence is a proposal and may change with product decisions.

Current application baseline is `0a16f7d` (task 010 committed). The owner's next feedback is [011: Planner usability](tasks/011-planner-usability.md), including user-local time entry/display and each workspace's own canonical zone. UTC instants remain authoritative; server location is irrelevant. The owner assigned all task 011 slices together; implementation and actual verification are recorded in [011 completion](tasks/011-implementation.md), pending coordinator review.

| Phase | Outcome | Evidence required for completion |
| --- | --- | --- |
| 0. Foundation | Verify stable stack compatibility; scaffold the app/checks for Ubuntu self-hosting | Verified startup/build/check commands; no secrets committed; documented decisions |
| 1. Workspace access | Accounts, personal-workspace bootstrap, shared workspaces, memberships; split into bounded tasks | Owner/editor flows, idempotent bootstrap, membership removal, and tests rejecting an unrelated user |
| 2. Projects, tasks, and board | Workspace-owned projects/subtasks, five fixed statuses, workspace-filtered board | Card moves update canonical tasks without changing workspace; filters combine only authorized workspaces; saves do not silently overwrite |
| 3. Calendar | Workspace-filtered time blocks and project/task assignment | Drag and explicit controls work; workspace consistency/visibility/time zones are tested; tasks survive block removal |
| 4. Desktop and Android workflow | Complete the personal/shared workspace-to-board-to-calendar journey | Full journey works with one or several workspaces selected on desktop and Android, including failed/conflicting saves and refresh |
| 5. Everyday capture | Personal lists/checklists, inbox, and basic notes | Personal data stays private; captured work can become a task without retyping; list/task semantics are documented |
| 6. Optional extensions | Custom statuses, SilverBullet links, recurrence, installability, or integrations | Scope chosen separately from the initial core; each extension gets its own task and acceptance criteria |

## How to issue implementation tasks

- Split phases into small tasks that deliver observable behavior. Do not assign a whole layer such as "build all frontend" without an agreed data/API contract.
- Name prerequisite changes and the files or components each task owns. Implement dependent contracts before parallelizing their consumers.
- Every handoff states acceptance criteria and verification expectations. Every completion records checks actually performed and known limitations.
- Review and integrate each task before considering its dependent workflow complete.
- Keep unselected product defaults visible. A roadmap entry does not settle an open question in `product.md`.

## Implementation handoffs

- [001: application foundation](tasks/001-foundation.md): implemented; see completion evidence and runtime limitations.
- [002: accounts and automatic personal-workspace creation](tasks/002-accounts-personal-workspace.md): identity and personal-workspace implementation; see its completion evidence and limitations. Shared-workspace membership follows separately.
- [003: shared workspaces and retry recovery](tasks/003-shared-workspaces-retry.md): implemented retry recovery, shared creation and owner/editor management for existing accounts; see verification evidence and development-policy limitations.
- [004: password confirmation and recovery](tasks/004-password-recovery.md): requested identity follow-up with SMTP email configuration; see its verification and provider-delivery limitations.
- [005: workspace-owned projects and tasks](tasks/005-projects-tasks.md): implemented and verified explicit-workspace project planning, tasks/subtasks, fixed statuses, and stale-save protection; see exact browser-run evidence and limitations. Kanban and calendar views follow separately.
- [006: cross-tab session and planning-draft isolation](tasks/006-cross-tab-session-isolation.md): implemented as `0c13917` and independently reviewed; delayed cookie effects require task 007.
- [007: read-only session verification](tasks/007-read-only-session-verification.md): implemented and verified (55 automated checks, 34 browser cases), with owner-confirmed approval before task 008. Planner probes cannot restore/delete browser auth cookies or renew valid sessions.
- [008: Kanban board](tasks/008-kanban-board.md): implemented as `500b136` and independently reviewed without actionable findings. Implementation passed 59 backend checks and 40 full browser cases; coordinator separately passed 59 backend checks and six focused board cases. See its completion handoff for distinctions and limits.
- [009: Calendar time blocks](tasks/009-calendar-time-blocks.md): implemented as `82d60e4`, corrected and independently re-reviewed at `da206b5`; no remaining actionable findings. See its completion and coordinator records for checks and limits.
- [010: HTTPS preview access](tasks/010-https-preview.md): requested reverse-proxy configuration guidance and explicit HTTPS preview signup; preserves existing account/workspace boundaries. Actual DNS/proxy/server changes are not performed by this task.
- [011: Planner usability](tasks/011-planner-usability.md): all slices implemented as `a621e0f`; see [implementation handoff](tasks/011-implementation.md). Coordinator review requires [two P2 fixes](tasks/011-review-fixes.md) for dialog history and the overflow regression's Retry activation before acceptance. Main handoff metadata is corrected in this documentation preparation.
