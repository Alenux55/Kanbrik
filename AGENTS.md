# Working on Kanbrik

Kanbrik is a project and task planner with Kanban boards and calendar time blocks. It must work on desktop and Android and include personal and shared workspaces in the first version. Saving edits requires a connection; offline editing is deferred. Initial task statuses are fixed; customizable statuses are a follow-up.

## Relevant context

- Use `docs/product.md` for scope and the distinction between confirmed requirements, proposed defaults, and open questions.
- Use `docs/architecture.md` when changing data, permissions, scheduling, or behavior shared across views.
- Use `docs/stack.md` for the recommended technology baseline and `docs/agent-workflow.md` for implementation/review handoffs.
- Use `docs/roadmap.md` and the assigned task file for implementation order and acceptance criteria.
- These documents are repository conventions, not automatic agent coordination. Task prompts should name the relevant files. Explicitly reread instructions when notified that they changed during a running session.

## Working agreements

- Keep changes within the assigned task. Preserve unrelated changes already in the checkout.
- Resolve routine implementation details within the task; surface product choices that materially affect scope, access, or data ownership. Do not present a proposed default as user-confirmed.
- Reuse the established stack and conventions once selected. Do not introduce a second stack for an isolated feature.
- Keep one authoritative task record across project, board, list, and calendar views. Time blocks reference work; they do not duplicate tasks.
- Support scheduling through explicit controls as well as dragging. Verify core workflows at an Android-sized viewport and with touch when available.
- Enforce workspace membership on the server for every applicable read and write. A workspace filter is a display preference, not authorization. Do not log credentials or session secrets.
- Projects, tasks, lists, notes, and time blocks have explicit workspace ownership. Validate that linked records belong to the same workspace. Changing a board filter or task status must not transfer data between workspaces.
- Centralize the initial statuses and stable IDs: `backlog`, `todo`, `in_progress`, `blocked`, and `done`. Only `done` means completed. Do not add custom-status UI or a "scheduled" task status in the first version.
- A failed save must remain visibly unsaved. Do not claim that local browser state provides offline editing or cross-device persistence.

## Verification and handoff

- No application setup or test commands exist yet. Add exact commands to README.md after implementing and verifying them; do not invent command results.
- Verify changed behavior with checks appropriate to its risk. Permissions, shared updates, time-zone behavior, and data relationships require meaningful automated coverage when implemented. Documentation-only changes do not require application tests.
- Report what changed, what was actually checked, and any limitations. Distinguish implemented behavior from plans.
- Update the relevant product or architecture documentation when an implementation changes its contract.

## Multiple agents

- Give each task a concrete outcome, scope, dependencies, acceptance criteria, and verification expectations. Use `docs/tasks/001-foundation.md` as the format.
- For concurrent work, use isolated branches or worktrees and assign clear ownership. Agree on shared types and API contracts before separate agents implement dependent components.
- Do not assume agents share live conversation history, working copies, or instruction updates. Carry decisions through reviewed repository changes and explicit handoffs.
- Keep task progress and verification evidence in the assigned task file or issue. Keep durable rules here and product decisions in their relevant documents.
- Review changes to these instructions as shared project policy; do not rewrite them merely to accommodate an individual task.
- Integrate and verify dependent work before marking the overall feature complete.
