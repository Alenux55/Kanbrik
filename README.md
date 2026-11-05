# Kanbrik

A project and task planner that connects configurable Kanban boards with calendar time blocks, for desktop and Android.

## Project status

Task 001 provides a Next.js application shell with responsive navigation to Projects, Board, Calendar, Lists, and Inbox / Notes. Every view is a placeholder. There are no accounts, saved records, editing, sharing, or database queries yet.

The first version includes personal and shared workspaces, with workspace filters on the calendar and board. It uses fixed task statuses and requires a connection to save edits. Offline editing and custom statuses are deferred. The target host is the owner's always-online Ubuntu server; Docker availability needs verification.

## Start here

- [Product scope](docs/product.md): requirements, proposed defaults, and open questions.
- [Architecture](docs/architecture.md): data relationships and behavior that implementations must preserve.
- [Recommended stack](docs/stack.md): application, database, authentication, and self-hosting recommendations.
- [Agent workflow](docs/agent-workflow.md): model settings and implementation/review handoffs.
- [Roadmap](docs/roadmap.md): delivery sequence and completion criteria.
- [First implementation task](docs/tasks/001-foundation.md): application foundation using the recommended stack.
- [Agent instructions](AGENTS.md): working agreements for coding agents.

## Local setup

Use Node.js 24 LTS (tested with 24.19.0) and npm (tested with 12.0.2). Exact dependencies are in `package.json` and `package-lock.json`.

```powershell
npm ci
npm run dev
```

Open [the local app](http://127.0.0.1:3000). Stop with Ctrl+C. The shell runs without an environment file or database. No fonts or other assets are fetched at runtime.

## Verification and production-mode preview

```powershell
npm run check
npm run test
npm run db:validate
npm run build
npx playwright install chromium
npm run test:e2e
npm run start
```

`check` runs ESLint and strict TypeScript checks, including generated Next.js route types. `test` establishes Vitest for future unit/integration tests; it currently reports no tests, which is not domain coverage. Browser tests run against a built app on port 3100; build first and leave that port free. They exercise navigation, refresh, keyboard access, touch emulation, overflow, and 404 responses on desktop and Pixel 7 profiles. `start` serves the build at [localhost](http://127.0.0.1:3000).

The first Prisma validation may download its engine and requires internet access (npm 12 can block its install hook). The current dependency audit has eight moderate development-only linter-chain findings and no production dependency findings; compatibility details are in [stack.md](docs/stack.md#task-001-selection-2026-11-05).

## Optional local database and containers

Docker Engine with Compose v2 is required for these steps. Docker is unavailable on the implementation machine, so the following commands and image pulls are **not runtime-verified**:

```powershell
Copy-Item .env.example .env
# Edit .env: replace both local password placeholders with the same disposable password.
npm run db:up
docker compose ps
npm run db:down
# Optional containerized shell:
docker compose --profile app up --build -d
docker compose down
```

On Ubuntu, use `cp .env.example .env` instead of `Copy-Item`. The Compose project is `kanbrik-local`; PostgreSQL uses database/user `kanbrik_dev`, binds only to `127.0.0.1:5433`, and persists in its own named development volume. `down` preserves that volume. The optional app binds to `127.0.0.1:3000` and currently needs no database connection. Do not use production credentials or a production database URL for local work.

The Prisma PostgreSQL datasource is present, but there are no models, generated client, or migrations. Authentication and its Prisma adapter are deferred to workspace access. Do not run migrations until that task defines the schema. The Dockerfile prepares a non-root standalone Next.js runtime; Compose is a local scaffold, not a production deployment procedure. Production proxy integration, secrets, migrations, backups, and a verified restore remain prerequisites for later deployment.

See the [task 001 handoff](docs/tasks/001-foundation.md#completion-handoff) for actual verification evidence and limitations.
