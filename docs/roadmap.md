# Delivery roadmap

Task 001 implements the foundation shell and local tooling; see its handoff for verification and limitations. All product phases remain planned. This sequence is a proposal and may change with product decisions.

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

The first handoff is [001: application foundation](tasks/001-foundation.md).
