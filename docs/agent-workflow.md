# Agent implementation workflow

These are starting recommendations, checked against official guidance on 2026-11-05. Availability depends on the models in the user's Codex interface. This file does not configure model settings.

| Work | Suggested model | Reasoning effort |
| --- | --- | --- |
| Routine implementation with a clear task | GPT-6.1 Sol | Medium |
| Foundation, permissions, database design, difficult scheduling behavior | GPT-6.1 Sol | High |
| Architecture and independent review of access control or difficult changes | GPT-6 Astra | High; Extra high for a demonstrated difficult problem |
| Small UI/text edits and isolated fixes after conventions exist | GPT-6 Luna | Medium |

These are project recommendations, not benchmark results. Escalate when verification exposes a reasoning gap; do not default every task to maximum effort. Establish conventions before using smaller models broadly.

## First implementation

1. Open `E:/Documents/GitHub/Kanbrik` as the repository in Codex.
2. Start an implementation chat and select GPT-6.1 Sol with High effort if available. Use one foundation implementer initially.
3. Ask it to read `AGENTS.md`, `docs/stack.md`, and `docs/tasks/001-foundation.md`, then implement task 001 through verification and update its handoff. Read relevant product/architecture context as needed.
4. Review the diff and verification evidence before dependent work. Use the architecture chat or a separate review chat for independent review.
5. Next issue bounded tasks for identity/personal-workspace bootstrap, shared-workspace membership, then projects/tasks. Add a task file with acceptance criteria for each assignment.

No OpenAI API integration or key is required by Kanbrik's proposed stack; these models are development tools.

## Subsequent handoffs

- Start with one implementation task per chat. Do not continue into all roadmap phases without an assignment.
- Carry decisions through repository documents and completion notes; agents do not inherit another chat's full history.
- Once core contracts exist, independent components may be developed concurrently in separate worktrees with explicit file ownership. Integrate before claiming a complete workflow works.
- Review actual changes for defects, especially workspace access, inconsistent references, failed saves, and concurrency.
- Model/effort choices are user-selected. Editing this file does not change another running agent's settings.

[Official model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection) supports the broad roles. The task assignments and effort levels here are project recommendations.
