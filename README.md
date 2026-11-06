# Kanbrik

A project and task planner that connects configurable Kanban boards with calendar time blocks, for desktop and Android.

## Project status

The application includes development/test email-password accounts, database-backed sessions, private personal workspaces, and shared-workspace access management (tasks 002–003). Owners can create a shared workspace and immediately grant editor access to existing accounts; owners can remove editors, and editors can leave. Projects, Board, Calendar, Lists, and Inbox / Notes remain placeholders: planner content, editing, and board/calendar workspace filters are not implemented.

The first version includes personal and shared workspaces, with workspace filters on the calendar and board. It uses fixed task statuses and requires a connection to save edits. Offline editing and custom statuses are deferred. The target host is the owner's always-online Ubuntu server; Docker availability needs verification.

## Start here

- [Coordinator handoff](docs/handoff.md): current implementation state, verification evidence, operational resolution, and next assignment boundaries.

- [Product scope](docs/product.md): requirements, proposed defaults, and open questions.
- [Architecture](docs/architecture.md): data relationships and behavior that implementations must preserve.
- [Recommended stack](docs/stack.md): application, database, authentication, and self-hosting recommendations.
- [Agent workflow](docs/agent-workflow.md): model settings and implementation/review handoffs.
- [Roadmap](docs/roadmap.md): delivery sequence and completion criteria.
- [First implementation task](docs/tasks/001-foundation.md): application foundation using the recommended stack.
- [Accounts and personal workspace](docs/tasks/002-accounts-personal-workspace.md): task 002 implementation and completion handoff.
- [Shared workspaces and retry recovery](docs/tasks/003-shared-workspaces-retry.md): task 003 implementation, permission contract, and completion evidence.
- [Password confirmation and recovery](docs/tasks/004-password-recovery.md): confirmation fields and configurable SMTP reset emails.
- [Agent instructions](AGENTS.md): working agreements for coding agents.

## Local setup

Use Node.js 24 LTS (tested with 24.19.0), npm (tested with 12.0.2), and a disposable PostgreSQL database (tested with 17.11). Exact dependencies are in `package.json` and `package-lock.json`. Never use production credentials/data in this checkout.

```powershell
npm ci
Copy-Item .env.example .env
# Set DATABASE_URL, BETTER_AUTH_URL and a generated BETTER_AUTH_SECRET in .env.
# Provision a disposable local database before applying migrations.
npm run db:generate
npm run db:migrate
npm run dev
```

Open [the local app](http://127.0.0.1:3000). Create a local development account, then test refresh, navigation, sign-out, and sign-in. Stop with Ctrl+C. Use `npm run dev -- --webpack` if the default CSS/helper-process failure also occurs in development. No fonts or other assets are fetched at runtime.

To test sharing, create at least two development accounts, using separate browser profiles/private windows to keep their sessions distinct. Open **Workspaces**, create a shared workspace, and use **Add existing account** with the second account's exact email. This grants access immediately as editor; no invitation or email is sent. The second account sees it after refresh and can leave; the owner can remove editor access. Personal workspaces cannot be shared. Emails remain unverified, so this development flow is not a production invitation/identity policy. Management does not select a global active workspace or enable planner content.

If a server request fails temporarily, **Try again** now requests fresh server content in the same session. A continuing failure leaves the error and retry available; recovery does not duplicate the personal workspace.

### Restart the Ubuntu test server

These instructions are for the manually started development/test app on port **3005**, with a separate disposable development database. In the server terminal running Kanbrik, press **Ctrl+C** first.

After code changes have been committed and pushed to GitHub, run on Ubuntu:

```bash
cd ~/github/Kanbrik
git pull --ff-only
nvm install
nvm use
npm ci
docker compose up -d --wait db
npm run db:migrate
npm run dev -- --webpack --port 3005
```

Run the commands in order and stop if one fails. Keep `BETTER_AUTH_URL=http://127.0.0.1:3005` in the server's existing `.env` for the SSH-tunnel setup. Git pulls preserve that ignored file; edit it rather than copying the example over your saved credentials. Database startup and migrations use the disposable database already configured for this checkout; no database reset is needed.

If you only changed `.env`, stop the app with **Ctrl+C** and restart it without reinstalling dependencies:

```bash
cd ~/github/Kanbrik
npm run dev -- --webpack --port 3005
```

Keep the app terminal open. On your own computer, keep the existing SSH tunnel open, or reconnect it (replace `USER@SERVER_IP` with your server login; add `-i /path/to/key` if needed):

```bash
ssh -N -L 127.0.0.1:3005:127.0.0.1:3005 USER@SERVER_IP
```

Refresh [http://127.0.0.1:3005](http://127.0.0.1:3005) on your own computer. This is the manual test server; automated browser checks start their own servers on different ports. These steps are a development workflow, not a production service/deployment setup.

Configuration is server-only: `BETTER_AUTH_URL` is the exact trusted app origin, `BETTER_AUTH_SECRET` is a generated random secret of at least 32 characters, and `DATABASE_URL` is the development database URL. Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and put it only in the ignored environment file. Restart the server after configuration changes.

URL-encode special characters in database URL passwords. The portable setup generates hexadecimal credentials, which need no escaping.

Registration requires **all** of `KANBRIK_ENV=local` or `test`, `ENABLE_LOCAL_REGISTRATION=true`, and a loopback `BETTER_AUTH_URL`. Otherwise Better Auth rejects sign-up server-side. Unset `KANBRIK_ENV` defaults to `production`; `NODE_ENV` does not enable registration. Sign-up now requires a matching password confirmation in the UI; that confirmation stays in the browser and is not sent or stored separately. Email verification and public-registration policy remain deferred; this development baseline is not production-ready identity administration.

### Password recovery email

The sign-in screen links to **Forgot your password?**. To enable automatic reset emails, add these settings to your existing ignored `.env` with values from your SMTP provider, then restart Kanbrik:

```dotenv
PASSWORD_RESET_ENABLED=true
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD="your-smtp-password-or-provider-app-password"
SMTP_FROM="Kanbrik Notifications <no-reply@your-domain.example>"
```

Replace every placeholder. `SMTP_FROM` accepts one plain email address or `Display Name <email>`; use an address your provider permits you to send from. Use port 587 for STARTTLS or 465 for implicit TLS; TLS certificate checks remain enabled. No SMTP credentials go in browser code or Git. `SMTP_ALLOW_INSECURE_LOCAL` defaults to false and is allowed only for an explicitly configured loopback mail server in local/test mode; real providers require TLS. Without the enable flag and complete valid settings, the forgot-password screen explains that email recovery is unavailable and the server rejects email requests.

If recovery still says it is not configured, run `npm run email:check` from the repository on the same machine/user as the app. It uses Next's development environment-file loading and the application's actual validation, reports loaded filenames and failing setting names only, and identifies inherited shell variables that override `.env`. It never prints credentials or tests SMTP connectivity. A valid result confirms configuration syntax, not delivery. Escape literal dollar signs in `.env` passwords as `\$`, since Next expands `$VARIABLE` references even inside quoted values. Restart the app after fixing settings.

If `.env` is listed as loaded but all SMTP fields and `PASSWORD_RESET_ENABLED` fail, inspect the saved file at `~/github/Kanbrik/.env` with `nano .env`. Check that the SMTP block was saved there, names use exact uppercase spelling, each setting appears only once, and quotes are balanced (including earlier database/auth settings). A later empty/default duplicate can replace your populated value, and an unclosed quote can disrupt parsing. Ordinary punctuation inside a correctly quoted password is supported.

On Ubuntu, this read-only command prints setting names/line numbers with all values hidden, making duplicate or incorrectly cased SMTP keys easier to spot:

```bash
awk '/^[[:space:]]*(PASSWORD_RESET_ENABLED|SMTP_[A-Za-z_]+)[[:space:]]*=/ { sub(/=.*/, "=[hidden]"); print NR ": " $0 }' .env
```

Share only this redacted output and `npm run email:check` results when troubleshooting; examine the actual values/quotes privately. Correct the saved file, rerun the diagnostic, then restart the app with the commands above.

Reset requests show the same generic confirmation for existing and unknown addresses. Delivery failures show a retryable generic error. Better Auth generates one-hour, single-use tokens and changes the password/revokes existing sessions atomically. Users confirm the new password, then sign in again; workspaces and memberships are preserved. No password is sent by email.

Email links use `BETTER_AUTH_URL` and must be reachable by the recipient. For the SSH setup, keep `BETTER_AUTH_URL=http://127.0.0.1:3005` and open the link on the computer with the tunnel running. The reset token is in a URL fragment, stays out of HTTP request URLs/server access logs, and is removed from the visible URL after the page opens. Reopen the original email link if you reload before completing the reset. No real-provider delivery or server configuration is performed automatically; configure and verify your provider before relying on recovery.

### Portable PostgreSQL on Windows (verified alternative to Docker)

Requires PowerShell 7. Download the PostgreSQL 17.11 Windows x64 binary archive from the [official EDB binaries page](https://www.enterprisedb.com/download-postgresql-binaries) and extract so `.local/postgresql/pgsql/bin/pg_ctl.exe` exists. Task 002 used the page's [17.11 archive link](https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616). No system service is installed.

For a fresh checkout **without existing `.env`, `.env.test`, or `.local/pgdata`**, run:

```powershell
pwsh -File scripts/portable-postgres.ps1 init
```

This starts PostgreSQL on `127.0.0.1:55432`, creates separate `kanbrik_dev` and `kanbrik_test` roles/databases, and writes generated credentials/secrets only to ignored `.env` and `.env.test` files. Do not copy the example over these generated files. Then run `npm ci`, `npm run db:migrate`, and the test migration command below. On later sessions:

```powershell
pwsh -File scripts/portable-postgres.ps1 start
pwsh -File scripts/portable-postgres.ps1 stop
```

The script refuses to overwrite existing data/configuration. `.local` contains binaries, cluster data and logs and must stay private/ignored. Keep the portable database running while using the app or running tests.

## Verification and production-mode preview

```powershell
npm run check
npm run db:validate
npm run db:test:migrate
# Recheck default build separately; prior helper-process failures remain unexplained:
npm run build
# Verified alternate/fallback:
npm run build -- --webpack
npm run test
npx playwright install chromium
npm run test:e2e
npm run start
```

For a separately provisioned test database, copy `.env.test.example` to `.env.test` and set `TEST_DATABASE_URL`. The portable setup already creates this file. Test commands refuse anything except a loopback PostgreSQL URL with database `kanbrik_test` (or `kanbrik_test_<suffix>`) and the public schema. They never use the development `DATABASE_URL` for tests. Use a separate role without rights on development/production data. Fixtures use generated credentials and clean up only their own accounts; no global reset/truncation runs.

`check` runs ESLint and strict TypeScript checks. `test` runs real PostgreSQL/HTTP integration tests plus test-target guards against a built app; build first and leave port **3110** free. It uses an in-memory SMTP sink on ephemeral loopback ports. `test:e2e` starts isolated test-configured production-mode servers on **3100** (local registration/recovery) and **3102** (registration/recovery disabled), plus a test-only SMTP sink on **3125** and its protected inbox reader on **3126**. Leave those ports free. Tests override delivery to loopback and never use your real SMTP provider or email addresses. Browser tests cover confirmation/recovery, accounts, session revocation, real server-error retry, shared membership management, errors/pending states, navigation, keyboard, touch emulation, overflow, and 404 API responses on desktop and Pixel 7 profiles. They run serially with a deliberate pause to respect Better Auth's shared-loopback-IP rate limit (about 4–5 minutes). Traces/videos are disabled to avoid recording passwords or session tokens. `start` serves the build at [localhost](http://127.0.0.1:3000).

Task 003's latest default Turbopack build passed, as did the Webpack build used for browser verification. Earlier default-build failures remain unexplained; this success is not a root-cause fix. Focused browser checks can be run with `npm run test:e2e -- --grep "retry requests"` or `npm run test:e2e -- --grep "owner grants"`.

The first Prisma validation may download its engine and requires internet access (npm 12 can block its install hook). The current dependency audit has eight moderate development-only linter-chain findings and no production dependency findings; compatibility details are in [stack.md](docs/stack.md#task-001-selection-2026-11-05).

## Optional local database and containers

Docker Engine with Compose v2 is required for these steps. Docker is unavailable on the implementation machine, so the following commands and image pulls are **not runtime-verified**:

```powershell
# Only if .env has not already been configured:
Copy-Item .env.example .env
# Set the local password in both database values and generate the auth secret.
npm run db:up
docker compose ps
npm run db:down
# Optional containerized shell:
docker compose --profile app up --build -d
docker compose down
```

On Ubuntu, use `cp .env.example .env` instead of `Copy-Item`. The Compose project is `kanbrik-local`; PostgreSQL uses database/user `kanbrik_dev`, binds only to `127.0.0.1:5433`, and persists in its own named development volume. `down` preserves that volume. The optional app binds to `127.0.0.1:3000` and connects internally to the Compose database. Do not overwrite the portable setup's environment file with Compose settings or use production credentials/data for local work.

The checked-in migration creates the Better Auth tables, workspace kind/owner, membership uniqueness, and personal-membership constraints. `db:migrate` applies it to the development database; `db:test:migrate` applies it only to the guarded test target. `npm ci` generates Prisma Client through the project postinstall hook; `db:generate` is available if local script policy blocks it. Schema validation may download its engine on first use.

The Dockerfile prepares a non-root standalone Next.js runtime. Compose keeps registration disabled and requires application secrets; apply migrations before using a containerized app. Containers and Linux runtime are unverified: Compose is a local scaffold, not a production deployment procedure. Production proxy integration, secrets, migrations, backups, verified restore, and account policy remain prerequisites for later deployment.

See the [task 001 handoff](docs/tasks/001-foundation.md#completion-handoff), [task 002 handoff](docs/tasks/002-accounts-personal-workspace.md#completion-handoff), and [task 003 handoff](docs/tasks/003-shared-workspaces-retry.md#completion-handoff) for actual verification evidence and limitations.
