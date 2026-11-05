# 001: Application foundation

Status: Complete (2026-11-05), with container/runtime limitations below.

Suggested model: GPT-6.1 Sol, High effort. This is a recommendation, not automatic configuration.

## Outcome

A minimal application that starts locally, renders a responsive shell on desktop and Android, and has a verified development/build/check workflow. This task establishes the foundation; it does not implement the product features.

## Dependencies and inputs

- Read `AGENTS.md` and the relevant product/architecture documents.
- Use `docs/stack.md` as the baseline: TypeScript/React/Next.js, Tailwind/shadcn, PostgreSQL/Prisma, Better Auth, npm, Vitest/Playwright, and Ubuntu Docker Compose hosting. Verify stable compatible versions and record those selected. Explain material incompatibilities before substituting technology.
- Account for personal/shared workspaces and online-only editing. Authentication integration/membership enforcement are subsequent tasks. Custom statuses are deferred.

## Scope

- Create the smallest coherent application scaffold with a responsive navigation shell.
- Provide placeholders for Projects, Board, Calendar, Lists, and Inbox/Notes, plus space for a future workspace selector. Clearly identify placeholders; do not simulate authenticated sharing.
- Establish the selected development/build/check tooling and dependency lockfile.
- Add ignore rules and an example environment file with placeholders if configuration is needed.
- Prepare local PostgreSQL configuration and application container scaffolding. Keep local development independent of production. If Docker is unavailable locally, record unverified runtime steps honestly.
- Defer calendar/board libraries and authentication schema/routes to their feature tasks.
- Document verified setup commands and architecture decisions.

## Boundaries

- No project/task/calendar CRUD, mock collaboration, offline synchronization, or SilverBullet integration.
- Do not present placeholder content as saved data or functional product behavior.
- Do not create separate backend services without a documented need.
- No production deployment or changes to external accounts are part of this task.

## Acceptance criteria

- A new checkout can install dependencies and start using the documented instructions.
- Desktop and narrow mobile navigation can reach each placeholder without unintended page-wide horizontal overflow.
- The documented build and applicable checks pass.
- Required configuration is explained without committing real credentials.
- Local configuration never connects to or changes production data.
- README and architecture notes accurately distinguish the scaffold from planned features.

## Verification

Run the selected build and static checks. Inspect the shell in a desktop browser and an Android-sized viewport; record whether a real Android device was available. Avoid tests that only assert placeholder text. Record startup/build evidence and any missing checks below.

## Completion handoff

Implemented the foundation only. No production server, external account, or production data was accessed or changed.

### Delivered

- `src/app/layout.tsx`, `src/components/navigation.tsx`, and the enumerated `src/app/[section]/page.tsx` provide a responsive shared shell and five explicit placeholders. The workspace area is explanatory text, not simulated membership or an operational selector. Root redirects to Projects; unrecognized sections return HTTP 404.
- Tailwind styling, a minimal repository-owned shadcn/ui badge, `components.json`, and utility/alias conventions. Keyboard focus, skip navigation, active-route indication, and touch-sized links are present.
- Exact dependencies/lockfile, TypeScript, ESLint, Vitest configuration, Playwright browser checks, and verified README setup/check commands. Versions and compatibility exceptions are recorded in `docs/stack.md`.
- Prisma 7 PostgreSQL datasource/config with no domain/auth models or migrations. `.env.example`, ignore rules, loopback-only disposable PostgreSQL Compose configuration, and a non-root application Dockerfile. Standalone output is enabled by `KANBRIK_STANDALONE=1` in the container builder; local builds use standard Next output.
- Architecture notes distinguish the implemented shell from planned contracts. Next's automatic agent-rule generation is disabled in config so startup preserves the existing `AGENTS.md` policy.

### Checks actually performed

Windows, Node 24.19.0, npm 12.0.2:

| Check | Result |
| --- | --- |
| npm registry engine/peer/version checks | Selected stable compatible packages; rejected Prisma 8 RC and incomplete Playwright 1.65.0 dependency chain |
| `npm ci` | Passed from lockfile; install warnings described below |
| `npm ls --depth=0` | Passed; no invalid direct dependency peers |
| `npm run check` | Passed: ESLint with no code warnings/errors and strict TypeScript/Next route generation |
| `npm run test` | Exit 0, explicitly no test files; Vitest readiness only, not unit/domain coverage |
| `npm run db:validate` | Passed; empty PostgreSQL datasource schema valid; no database connection or migration |
| `npm run build` | Passed; optimized build generated all five section routes |
| `npx playwright install chromium` | Passed |
| `npm run test:e2e` | 6 passed against `npm run start -- --port 3100`; all five routes via desktop clicks and mobile taps, active links, refresh, overflow, keyboard skip/navigation, and HTTP 404 |
| Screenshot inspection | Desktop 1440×900 and Pixel 7 393×727 CSS viewport (Chromium, touch enabled on mobile); readable layouts, no page-wide horizontal overflow |
| `npm run dev -- --port 3101` | Ready; HTTP GET `/projects` returned 200; stopped after check. Confirmed no generated instruction block after disabling agentRules |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit --json` | 8 moderate development-only linter-chain findings; details in stack.md |
| `git diff --check` | Passed for tracked changes; original README/planning work preserved |

Initial restricted build could not start the CSS subprocess; rerunning with the required process access passed. Prisma validation initially could not download its engine under restricted networking; network-enabled validation passed. These were environment restrictions, not hidden successful checks.

### Limitations and next handoff

- Docker is not installed (`docker --version` unavailable). Compose validation, image pulls, container build/start, PostgreSQL connectivity/persistence, Linux runtime, migrations, and backup/restore were **not tested**. These remain explicit verification work before deployment; local scaffold does not authorize deployment.
- No real Android device was available. Mobile evidence is Chromium Pixel 7 viewport/touch emulation, not native-device testing. Firefox/WebKit were not tested.
- ESLint 9 is end-of-support but remains within the selected Next plugins' declared peers; ESLint 10 does not. Audit findings arise from minimatch in the TypeScript ESLint dependency chain. No forced major overrides were applied; production dependency audit is clean. Revisit compatible upstream releases before adding features.
- npm 12 blocked Prisma's install hooks under its default script policy. CLI validation subsequently downloaded the engine successfully; first validation requires network access. Engine download success is not database integration coverage.
- Authentication, Prisma Client/driver integration, workspace enforcement, CRUD, task statuses, drag/calendar libraries, save behavior, and offline behavior are intentionally unimplemented. No future-feature dependency was installed in anticipation of those phases.
- Next dependent task: bounded identity and idempotent personal-workspace bootstrap, with Better Auth/Prisma schema and meaningful database/security tests. Define its task record and acceptance criteria before implementation; shared membership follows it. Product defaults remain proposed until explicitly settled.
