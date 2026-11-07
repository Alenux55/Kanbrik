# Delivery roadmap

Tasks 001–008 implement the foundation, development/test identity/recovery, personal/shared access, project/task planning, corrected cross-tab verification, and the Kanban board with saved authorized workspace selection. Phase 2's board passed independent review at `500b136`. Task 009 implements Calendar and its separate selection; independent review is pending. See handoffs for exact evidence and limits. This sequence is a proposal and may change with product decisions.

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
- [009: Calendar time blocks](tasks/009-calendar-time-blocks.md): implemented after board review; see its completion record for actual checks and limitations. Empty/assigned workspace-owned blocks, time-zone-aware scheduling, separate saved workspace filters, explicit desktop/Android controls and desktop assignment/move/resize gestures. Independent review remains pending; no deployment is authorized.
