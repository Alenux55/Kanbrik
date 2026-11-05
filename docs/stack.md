# Recommended stack

Status: Application foundation selected and installed in task 001; no production deployment. Future-feature recommendations remain deferred. Exact installed versions and transitive resolutions are recorded in `package.json` and `package-lock.json`.

## Task 001 selection (2026-11-05)

Node.js 24 LTS (local 24.19.0), npm 12.0.2, Next.js 16.4.5, React/React DOM 19.3.1, TypeScript 5.9.3, Tailwind CSS/PostCSS plugin 4.3.4, ESLint 9.39.5 with matching Next config, Vitest 5.1.0, Playwright 1.64.0, and Prisma CLI 7.10.1. UI uses manual shadcn/ui conventions (`components.json`, `cn`, repository-owned badge); no CLI/runtime package is needed for this minimal component.

Versions were checked using npm registry version, engine, and peer metadata as well as official documentation. Next.js requires Node >=20.9 and accepts React 19. Prisma 7.10.1 accepts Node 24; the selected Node engine is conservatively >=24.11 and <25. TypeScript 5.9.3 is a stable supported baseline; adopting TypeScript 7 is unnecessary for this task. Vitest 5 supports Node 24. Playwright 1.65.0's test package referenced an unavailable `playwright-core@1.65.0` during installation, so the complete stable 1.64.0 dependency chain was selected.

The Prisma `latest` tag resolved to **8.0.0-rc.30**, so it was explicitly rejected in favor of stable **7.10.1**. Better Auth 1.7.18 declares Next 16, React 19, and Prisma 7 compatibility; its official adapter guide uses Prisma 7/PostgreSQL. These identity dependencies were subsequently installed in task 002 as recorded below. FullCalendar and dnd-kit remain uninstalled until their feature tasks. Their integration has not been verified by the shell build.

Compose selects PostgreSQL **17.11** (a supported stable minor listed by PostgreSQL) with Debian Bookworm images and Node **24.19.0**. Image pulls and runtime compatibility are unverified because Docker is absent; no claim of database or container integration is made.

Compatibility references: [Node release schedule](https://github.com/nodejs/Release), [Next installation requirements](https://nextjs.org/docs/app/getting-started/installation), [Prisma 7 upgrade requirements](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma), [manual shadcn installation](https://ui.shadcn.com/docs/installation/manual), [PostgreSQL supported versions](https://www.postgresql.org/support/versioning/).

Known tooling limitation: ESLint 9.39.5 reports end of support, but the selected Next config depends on `eslint-plugin-react@7.37.5` and `eslint-plugin-import@2.32.0`, whose declared peer ranges stop at ESLint 9. ESLint 10.14.0 is therefore not selected with unsupported peers. npm audit reports eight moderate development-only findings, all stemming from the TypeScript ESLint chain's minimatch dependency ([advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)); the suggested automated fix downgrades the Next config to a different major. No forced peer/major overrides were applied. Revisit when upstream publishes compatible fixes.

## Application

Task 002 additions: Better Auth and `@better-auth/prisma-adapter` **1.7.18**, Prisma Client and `@prisma/adapter-pg` **7.10.1** (matching CLI), `pg` **8.23.1**, Zod **4.6.7**, `server-only` **0.0.1**, and `@types/pg` **8.23.1**. Stable version/engine/peer metadata was checked before installation. Official [Next integration](https://better-auth.com/docs/integrations/next), [email/password](https://better-auth.com/docs/authentication/email-password), and [Prisma adapter](https://better-auth.com/docs/adapters/prisma) APIs were checked against the installed packages. Client generation uses Prisma 7's `prisma-client` generator; authentication models match the adapter's required user/session/account/verification fields.

PostgreSQL **17.11** was downloaded from the [official EDB binary archive page](https://www.enterprisedb.com/download-postgresql-binaries) and run portably on Windows without installing a system service. Separate generated local/test credentials and database roles live only in ignored files. Docker remains unavailable/unverified.

Task 002 build result: the default `npm run build` still fails with the Turbopack CSS/helper-process error reproduced by independent review. Its cause remains unresolved. `npm run build -- --webpack` succeeds and supplies the build used by database/auth and browser checks. The default command was retained to keep the unresolved issue visible; no bundler rewrite or broad upgrade was made.

Task 003 uses the same pinned dependencies and schema. The installed Next.js 16.4.5 bundled `error.md`, error-boundary types and implementation document/implement stable `retry()` (refresh plus reset); this replaces reset-only error recovery. [Official error API](https://nextjs.org/docs/app/api-reference/file-conventions/error) was also checked. In task 003's latest verification, both default Turbopack and alternate Webpack builds passed; browser verification uses the Webpack build. The earlier helper-process failures remain unexplained, and no root-cause fix or broad tool upgrade is claimed.

| Area | Recommendation | Reason |
| --- | --- | --- |
| Application | TypeScript, React, Next.js App Router on Node.js LTS | One language/application for UI and server operations; self-hostable |
| UI | Tailwind CSS and shadcn/ui | Responsive controls that can be adapted in the repository |
| Database | Self-hosted PostgreSQL | Relational constraints and transactions fit memberships, linked tasks, and shared edits |
| Database access | Prisma ORM and checked-in migrations | Typed access and an explicit change history; select a stable compatible release |
| Authentication | Better Auth with the Prisma adapter | Self-hosted identity/session management with Next.js integration; workspace authorization stays in the application |
| Calendar | FullCalendar Standard React integration | Day/week/list views, dragging/resizing, external drops, and touch support |
| Board | dnd-kit React integration | Sortable interactions; verify the selected stable API before implementation |
| Validation | Zod for server input validation | Explicit input contracts at server boundaries |
| Verification | Vitest with database integration tests; Playwright for browser flows | Cover permissions/data behavior and desktop/mobile interactions |
| Package manager | npm with a checked-in lockfile | Straightforward local setup without another package-manager prerequisite |

Do not install future-feature libraries in the foundation task. Add calendar/board dependencies with those features. Avoid separate API services, queues, Redis, or realtime servers until a demonstrated requirement calls for them.

FullCalendar Standard plugins are MIT-licensed; Premium resource/timeline features have separate terms and are outside this proposal. External drops are a building block, not proof of assignment onto an existing block. That interaction needs an explicit target/assignment handler and touch/button alternatives. Avoid competing drag sensors when integrating board and calendar.

## Deployment target

- Owner's always-online Ubuntu server. Docker is expected but unverified; check Docker Engine and Compose before deployment.
- Proposed Compose services: application and PostgreSQL, with a persistent database volume.
- Reuse the server's existing HTTPS reverse proxy where available. If none exists, Caddy is a reasonable option; do not replace existing infrastructure during scaffolding.
- Keep database ports private to the app network in production. Use environment-based secrets and a placeholder example file.
- Develop locally on Windows against a disposable development database; production is separate.
- Document migrations, backups, and a verified restore procedure before production use.
- Planning documents do not themselves authorize production server changes.

## Sources checked on 2026-11-05

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying) and [self-hosting](https://nextjs.org/docs/app/guides/self-hosting).
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next) and [Prisma adapter](https://better-auth.com/docs/adapters/prisma).
- [shadcn/ui](https://ui.shadcn.com/docs) and [dnd-kit](https://dndkit.com/).
- [FullCalendar external dragging](https://fullcalendar.io/docs/external-dragging), [touch](https://fullcalendar.io/docs/touch), and [license](https://fullcalendar.io/license).
- [Vitest](https://vitest.dev/guide/) and [Playwright](https://playwright.dev/docs/intro).

These sources establish capabilities. This combination is an architectural recommendation, not a vendor claim that it is uniquely best for Kanbrik.
