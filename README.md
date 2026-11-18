# Kanbrik

A project and task planner that connects configurable Kanban boards with calendar time blocks, for desktop and Android.

## Project status

The application includes development/test accounts/recovery, personal/shared workspaces, project/task planning, verified cross-tab identity, a Kanban board over canonical tasks, and Calendar time blocks (tasks 002–009). Projects supports planning text, standalone/project tasks and one-level subtasks. Board combines selected workspaces under five fixed statuses with revision-protected moves. Calendar supports one-off empty or assigned blocks across saved workspace selections. Workspace Trash now supports reversible project/task/subtask deletion (task 013). Lists and Inbox / Notes remain placeholders.

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
- [Projects and tasks](docs/tasks/005-projects-tasks.md): workspace-owned planning, canonical tasks/subtasks, fixed statuses, and shared-edit conflict handling.
- [Kanban board](docs/tasks/008-kanban-board.md): canonical cards, saved workspace selection, explicit/drag status changes, and verification evidence.
- [Cross-tab account isolation](docs/tasks/006-cross-tab-session-isolation.md): implemented guards; the later read-only verification fix closes its delayed-cookie finding.
- [Read-only verification](docs/tasks/007-read-only-session-verification.md): implemented cookie-immutable planner probes.
- [Calendar time blocks](docs/tasks/009-calendar-time-blocks.md): workspace filters, time zones, project/task assignment, desktop/Android controls and completion evidence.
- [Planner usability feedback](docs/tasks/011-planner-usability.md): implemented sidebar defaults, shared editors, compact Projects/Board, Calendar drag fixes and user/workspace time-zone settings; see its completion/review record.
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

To test sharing, create at least two development accounts, using separate browser profiles/private windows to keep their sessions distinct. Open **Workspaces**, create a shared workspace, and use **Add existing account** with the second account's exact email. This grants access immediately as editor; no invitation or email is sent. The second account sees it after refresh and can leave; the owner can remove editor access. Personal workspaces cannot be shared. Emails remain unverified, so this development flow is not a production invitation/identity policy. Management does not select a global active workspace.

### Test projects and tasks

Open **Projects** and explicitly choose a **Planning workspace**. Create a project and open it to edit planning text or add tasks. Use **Standalone tasks / all projects** for work without a project. **Edit / add subtask** opens a task's form and a one-level subtask form. Parent and child statuses are independent; only **Done** means completed. Workspace/project/parent assignment is fixed at creation; moving, deleting, and archiving are deferred.

Use **Refresh planning** to fetch other people's saved changes. There is no live push update. To test a conflict, open the same task in two authorized browser sessions, edit both, and save one first. The second save keeps its draft and shows the saved version. Either **Load saved version** to discard the draft, or compare/reconcile the text and choose **Review complete: keep my draft**, then explicitly save again. No automatic retry overwrites the newer record.

Drafts stay in memory, scoped to their user/workspace/record, while navigating between planner views or switching workspaces. Pending saves cannot be submitted twice after navigating back. A failed save stays visibly unsaved. Refresh/closing the document loses drafts (the browser warns when supported); sign-out discards them. This is not offline editing or durable draft storage. If access ends, the next content fetch/action clears the working view and that workspace's drafts. Calendar can reference projects/tasks without copying them. Lists/Inbox do not yet display these records.

### Accounts in multiple tabs

Planner identity checks use a cookie-immutable `/api/planner-session` response: checking an account cannot renew or clear authentication cookies. Planner actions do not extend session expiry; sign in again when a session expires. Sign-in/out and password reset remain deliberate authentication operations. This prevents an old verification response from undoing a newer sign-in in another tab.

### Test the board

Open **Board**, check the workspaces you want, and select **Apply selection**. First use selects only your personal workspace. Selection is saved for your account, independently of Projects; **Clear selection**, then **Apply selection** persists an empty board even after reload/sign-in. Changing the selection cancels any drag. **Refresh board** reloads accessible workspaces and tasks; there is no live push.

Each task/subtask is one card under its own status, with workspace/project/parent labels and plain-text details. Open a card to use its labeled **Status** selector on desktop, touch or keyboard; desktop mouse users can also drag the whole card. Same-column drops do not reorder or save anything. Each workspace workflow keeps all its active columns in a labeled horizontally scrollable region on Android. Swipe between columns; vertical touch scrolling does not move cards. Saved workflow completion metadata is authoritative (only seeded Done starts completed); parent and child statuses stay independent. Edit titles/descriptions in Projects.

A conflict keeps the saved card in place and shows the current server version. **Review saved version** loads that revision; make another explicit move afterward if desired. A failed move is unconfirmed and requires **Allow retry** followed by a new explicit move. Board changes do not rebase or discard Projects drafts; their eventual save may conflict normally. A failed workspace load marks the board/counts **incomplete**, with no editable stale cards from that workspace. Revoked workspaces/cards disappear on the next fetch/action. All board actions use the verified session boundary and expected-account checks.

Task 008 adds migration `202611060001_board_preference`. After pulling committed changes, run the documented restart sequence including `npm ci` and `npm run db:migrate`; do not reset the database. Calendar adds its own migration below; no production deployment is included.

Tabs in the same browser profile share sign-in cookies. When another tab signs in as a different account or signs out, planner tabs verify their account on notification, resume/focus, navigation, and before protected changes. A confirmed account change clears the old account's drafts/selection and refreshes the whole planner, including its header and workspace options. An unchanged account keeps its drafts and conflict review. If verification fails, editing pauses with **Retry session check**; a connection failure does not mean you have been signed out.

To check this, use two accounts with access to a shared workspace/task. Leave an unsaved edit in tab 1, open `/sign-in` in tab 2 of the **same browser profile**, and sign in as the other account. Return to tab 1: its header must show the new account, workspace selection must be empty, and reopening the saved task must not show the old account's draft. Switching back must not revive that draft. Signing out in tab 2 must also take tab 1 to sign-in when it checks the session. Use separate profiles/private windows when you want two independent simultaneous sessions instead.

If a server request fails temporarily, **Try again** now requests fresh server content in the same session. A continuing failure leaves the error and retry available; recovery does not duplicate the personal workspace.

### Test Calendar

Open **Calendar → Advanced**, choose visible workspaces, then **Apply filters**. Set your input/display zone in **User settings** (for example, `America/Los_Angeles`, `America/Vancouver` or `UTC`). First use selects only personal and detects the browser zone, with UTC fallback. Calendar preferences are saved independently of Board. Unchecking all workspaces and applying persists an empty Calendar. **Refresh calendar** reloads authorized workspaces and current blocks; apply or cancel any proposed preferences first. Dirty block forms remain in memory during planner navigation, range/zone changes and this refresh.

Choose a date with previous/next/Today and day/week controls. Desktop initially shows a week grid; Android initially shows a visible day time grid, with Agenda as an alternative. An explicit View choice survives resizing, and week overflow stays inside the Calendar. **New block** has an explicit destination workspace and defaults to noon–3 PM. Create it empty, then drag a palette project/task onto that existing empty block on desktop, or use **Edit block → Assigned work → Save block** on keyboard/touch. Replacement and unassignment use the form. Work and block must share a workspace; scheduling does not change work status or revision. Multiple blocks may reference the same work; overlaps are allowed.

Use the form to edit the label, editing zone, start and end. Nonexistent spring times are rejected; repeated fall times show both UTC offsets and require an explicit choice. Actual elapsed hours are shown, including overnight/multi-day/DST intervals. Changing the display zone leaves saved instants unchanged and keeps dirty forms in their original editing zone. Desktop move/resize uses 15-minute snapping; explicit times are not rounded. Escape, same-position drops and context changes cancel gestures. Touch uses explicit controls.

Saves confirm only after the server responds. Failed/uncertain input remains visible. An uncertain create retains its original request key and freezes its input: retry **Create block** to reconcile it, including after navigating away and back. **Discard draft / new create intent** intentionally abandons that draft; an already committed block may still exist. A conflict shows the saved version beside the draft: load it or explicitly review/keep proposed input, then save again. **Remove** (accessible name identifies the time block) asks for confirmation and removes only the block. Retrying an uncertain deletion checks the original block and current workspace access. Incomplete loads/pickers are marked; revoked workspace content/drafts disappear on the next fetch/action. If a collaborator deletes a block while you drag onto it, Calendar checks workspace access separately and keeps unrelated drafts/selection. A failed access check stays unconfirmed. Full document reload/sign-out can discard in-memory drafts; this is not offline editing.

Task 009 adds additive migration `202611060002_calendar` for blocks, separate Calendar preferences and create-intent records. Run `npm ci` and `npm run db:migrate` during the restart below. Do not reset the database. Keep Node/browser time-zone data current; the server validates offsets using its IANA rules. No production server was changed.

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

### Share the preview through your HTTPS reverse proxy

For the shared HTTPS preview, use the **build/start** sequence below. The earlier `dev` commands are the development workflow. If intentionally using hot reload through `kanbrik.spurious-emissions.com`, start with `npm run dev -- --webpack --hostname 10.0.0.95 --port 3005`. `next.config.ts` explicitly allows that development hostname; other custom domains need their own exact entries in `allowedDevOrigins` (hostname only). Restart after configuration changes. The proxy must also forward WebSocket upgrades for hot reload. This setting permits development resources only; account/session trusted Origins still come from `BETTER_AUTH_URL`.

The `Blocked cross-origin request ... /_next/hmr` warning identifies a blocked development connection. A stuck **Checking your session** screen also needs the browser's `/api/planner-session` request checked; the HMR warning alone does not establish its cause. A root `307` redirect is expected, and a missing `favicon.ico` is cosmetic.

For the owner's LAN/VPN server at **10.0.0.95**, point your chosen subdomain's DNS at the server as appropriate for that network. Configure your existing proxy to terminate HTTPS and forward to **http://10.0.0.95:3005**. Preserve the original Host and set the usual forwarded host/protocol headers. If the proxy runs directly on this Ubuntu host, it can instead forward to **http://127.0.0.1:3005** and the app can keep its default loopback binding. A proxy in another container/machine needs an upstream address it can actually reach.

In **Nginx Proxy Manager**, the Proxy Host's destination scheme is **http**, Forward Hostname/IP is **10.0.0.95**, and Forward Port is **3005**. In its SSL tab, select/request the subdomain's certificate and enable **Force SSL**. The browser connects to the proxy over HTTPS; the proxy-to-app connection stays HTTP. This uses [NPM's SSL termination](https://nginxproxymanager.com/guide/); choosing HTTPS as the destination would require the upstream app itself to serve TLS.

Stop the old app with Ctrl+C. Edit the **Ubuntu server's** existing `~/github/Kanbrik/.env`, preserving database/auth/SMTP credentials, and replace the example hostname:

```dotenv
BETTER_AUTH_URL=https://kanbrik.your-domain.example
KANBRIK_ENV=preview
ENABLE_PREVIEW_REGISTRATION=true
ENABLE_LOCAL_REGISTRATION=false
```

`BETTER_AUTH_URL` is the exact **browser-facing HTTPS origin**, usually without port 3005; it is not the proxy's HTTP upstream address. Use this same HTTPS URL from your desktop and Android. Sign in afresh after changing origins. Recovery emails automatically use the new URL after restart. Database access remains on loopback.

After committing/pushing and pulling the desired code, run on Ubuntu:

```bash
cd ~/github/Kanbrik
nvm use
npm ci
docker compose up -d --wait db
npm run db:migrate
npm run build -- --webpack
npm run start -- --hostname 10.0.0.95 --port 3005
```

The explicit hostname overrides the script's loopback default and binds to that server interface. For a proxy directly on the host using 127.0.0.1, use `npm run start -- --port 3005` instead. Stop if a command fails; keep the terminal open. This remains a manually run preview, not a persistent system service. No SSH tunnel is needed for users reaching the HTTPS subdomain. Only your proxy/intended network should reach the upstream port; the database port stays private. DNS, proxy, TLS and firewall changes are performed on your server, not by these repository changes.

The separate preview flag permits signup only in preview mode with an HTTPS canonical URL. **Anyone who can reach that preview can create an account while enabled**; restrict proxy access to the intended LAN/VPN audience. Set `ENABLE_PREVIEW_REGISTRATION=false` and restart to close signup; existing accounts can still sign in. This does not implement invitations or verified emails. Each new account gets its own personal workspace. Use **Workspaces → Add existing account** with their email to grant access to a shared workspace; creating an account alone grants no access to your work. Shared members are editors, not read-only viewers.

Use the HTTPS subdomain rather than browsing the HTTP upstream directly: browser-origin checks and secure session cookies use the configured HTTPS origin, and Calendar uses browser features available in secure contexts. Local/test loopback registration and production mode retain their existing policies. See [010: HTTPS preview access](docs/tasks/010-https-preview.md) for the change and verification record.

Configuration is server-only: `BETTER_AUTH_URL` is the exact trusted app origin, `BETTER_AUTH_SECRET` is a generated random secret of at least 32 characters, and `DATABASE_URL` is the development database URL. Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and put it only in the ignored environment file. Restart the server after configuration changes.

URL-encode special characters in database URL passwords. The portable setup generates hexadecimal credentials, which need no escaping.

Local registration requires **all** of `KANBRIK_ENV=local` or `test`, `ENABLE_LOCAL_REGISTRATION=true`, and a loopback `BETTER_AUTH_URL`. The separate HTTPS preview flow above requires `KANBRIK_ENV=preview`, `ENABLE_PREVIEW_REGISTRATION=true`, and an HTTPS `BETTER_AUTH_URL`. Both require an empty `INVITATION_ADMIN_EMAILS`; configuring administrators selects the invitation-only flow below. Otherwise Better Auth rejects public signup server-side. Unset `KANBRIK_ENV` defaults to `production`, which keeps public signup disabled even if either flag is true; `NODE_ENV` does not enable registration. Signup requires matching password confirmation in the UI; that confirmation stays in the browser and is not sent or stored separately. General verification of existing/publicly registered accounts remains deferred.

### Invite users without opening registration

In the **Ubuntu server's** existing `~/github/Kanbrik/.env`, add your existing account email (replace the example):

```dotenv
INVITATION_ADMIN_EMAILS="your-account@example.com"
ENABLE_PREVIEW_REGISTRATION=false
```

For multiple administrators, separate email addresses with commas inside the quotes. Use the emails of existing accounts you trust to admit new users. A nonempty administrator setting selects invitation-only signup, overriding old public-signup flags. Invalid addresses disable invitation administration; an empty value disables invitations and leaves the existing local/preview signup flags in control. Use your configured HTTPS origin in `BETTER_AUTH_URL`. Keep the existing SMTP settings; invitation mail works independently of `PASSWORD_RESET_ENABLED`.

After pulling this change, use the restart sequence above, including `npm ci`, `npm run db:migrate`, and a successful build. It adds one additive invitation-table migration and preserves existing accounts/work. Changes to the server's `.env` need an app restart; Git does not synchronize that file.

Sign in using the listed account, open **User settings → Account invitations**, enter the person's email and choose **Send account invitation**. They open the email, choose a name/password, confirm the password, then sign in normally. They receive only a private personal workspace. Grant shared access separately through **Workspaces → your shared workspace → Add existing account**.

Links expire after seven days and work once. **Resend** replaces the previous link; wait one minute between sends to the same address. **Revoke** cancels an outstanding invitation, without deleting an already created account. Removing an administrator from the allowlist also invalidates invitations they issued. Recipients must be able to reach your HTTPS site through the intended LAN/VPN network. If they are signed in to another account, they should sign out or open the link in a private window. Reopen the email link after reloading the acceptance page. Administrators cannot set/reset another user's password through this flow.

### Password recovery SMTP settings

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

## Planner usability and settings

After pulling task 011, run the existing restart sequence including **npm ci**, **npm run db:migrate**, a successful **npm run build -- --webpack**, then start the app. There are two new additive settings migrations; do not reset the database. They retain existing block instants and migrate the saved Calendar zone into User settings. Existing workspaces start with a UTC reference zone; owners can change it under Workspaces → workspace → Workspace settings.

The navigation's Creation workspace is your saved default and the workspace Projects browses. Board keeps an independent visibility selection and its explicit Show creation workspace action. Calendar follows Creation workspace by default; Advanced → Selected workspaces saves an independent selection, including empty. Existing Calendar selections are preserved on upgrade; choose Follow creation workspace in Advanced to adopt the new default. Projects uses expandable rows, while titles and Board cards open shared editors. Project/tag/search filters apply immediately in each view. Advanced uses Apply/Cancel for workspace scope, tag matching, Projects/Board dates and Board-only Hide completed. Task restrictions last for the current signed-in planner session; workspace selections persist across devices. Clear filters retains the workspace scope.

User settings → Preferred time zone controls viewing and ordinary schedule entry across devices. Workspace time zones are shared reference clocks, not separate scheduled moments. Settings changes do not move blocks. Unfinished forms keep their captured input zone.

Calendar New block and event/agenda activation open the same responsive block editor. Main work cards open their canonical work editor; redundant per-card Schedule buttons have been removed. Keyboard/touch scheduling uses New block and Assigned work. Desktop blank-slot work drops create a one-hour block; drops onto an existing empty block only assign it. Pending saves block dismissal. Dirty close/Escape/Back asks before discarding; Keep draft for later retains input for review during planner navigation. This is memory-only: document reload/closing or account changes lose it. Discarding an unconfirmed request does not undo a possible server commit.

See the [task 011 handoff](docs/tasks/011-implementation.md) for slice-by-slice evidence and limitations. Focused checks: npm run test:e2e -- planning.spec.ts board.spec.ts calendar.spec.ts settings.spec.ts. The full npm run test:e2e run is required after integration.

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

`check` runs ESLint and strict TypeScript checks. `test` runs real PostgreSQL/HTTP integration tests plus test-target guards against a built app; build first and leave ports **3110**, **3112**, **3113**, **3116**, **3117** and **3118** free. It uses an in-memory SMTP sink on ephemeral loopback ports. `test:e2e` starts isolated test-configured production-mode servers on **3100** (local registration/recovery) and **3102** (registration/recovery disabled), plus a test-only SMTP sink on **3125** and its protected inbox reader on **3126**. Leave those ports free. Tests override delivery to loopback and never use your real SMTP provider or email addresses. Browser tests cover Calendar create/assignment/move/resize/delete, DST choices, retained/uncertain/conflicting drafts, incomplete/obsolete range loads, pending-save account isolation, multi-workspace board preferences, pointer/keyboard/control status moves, conflicts/incomplete loads, same-profile account switching/logout, failed session checks, obsolete in-flight responses, project/task/subtask persistence, shared conflicts, draft navigation, failed/pending saves, revoked access, confirmation/recovery, accounts, real server-error retry, shared membership management, navigation, keyboard, touch emulation, overflow, and 404 responses on desktop and Pixel 7 profiles. They run serially with a deliberate pause to respect Better Auth's shared-loopback-IP rate limit (about 50–55 minutes for the current integrated suite). Traces/videos are disabled to avoid recording passwords or session tokens. `start` serves the build at [localhost](http://127.0.0.1:3000).

Task 006's default Turbopack and Webpack builds passed; the final browser verification uses Webpack. Earlier default-build failures remain unexplained; this success is not a root-cause fix. Focused browser checks can be run with `npm run test:e2e -- --grep "same-cookie tabs|session verification failures|obsolete save completion"`, `npm run test:e2e -- --grep "personal planning|shared editing detects"`, or `npm run test:e2e -- --grep "retry requests"`.

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

The checked-in migrations create the Better Auth/workspace tables and add Project/Task records with workspace-consistent references, fixed statuses, one-level hierarchy checks, and revisions. Task 005 adds `202611050002_projects_tasks`; existing users, sessions, workspaces, and memberships are preserved. `db:migrate` applies pending migrations to the development database; `db:test:migrate` applies them only to the guarded test target. No database reset is required. `npm ci` generates Prisma Client through the project postinstall hook; `db:generate` is available if local script policy blocks it. Schema validation may download its engine on first use.

The Dockerfile prepares a non-root standalone Next.js runtime. Compose keeps registration disabled and requires application secrets; apply migrations before using a containerized app. Containers and Linux runtime are unverified: Compose is a local scaffold, not a production deployment procedure. Production proxy integration, secrets, migrations, backups, verified restore, and account policy remain prerequisites for later deployment.

See the [task 001 handoff](docs/tasks/001-foundation.md#completion-handoff), [task 002 handoff](docs/tasks/002-accounts-personal-workspace.md#completion-handoff), and [task 003 handoff](docs/tasks/003-shared-workspaces-retry.md#completion-handoff) for actual verification evidence and limitations.

Focused Calendar checks: `npm run test:e2e -- tests/e2e/calendar.spec.ts`. Run the full suite after integration; focused passes do not establish the existing regressions still pass.

Editor history and drag/session recovery: `npm run test:e2e -- dialog-history.spec.ts 011-overflow.spec.ts`. These use real Back/Forward navigation on desktop/Android and keyboard Retry activation after a desktop mouse drag. See the [task 011 correction handoff](docs/tasks/011-review-fixes.md) for actual final results and limits.

Invitation checks: `npm run test:e2e -- invitations.spec.ts` covers desktop and Android emulation. Browser verification also starts an invite-only app on loopback **3108**; backend invitation checks use **3112**. Keep those ports free along with the existing test ports. These fixtures override administrators/SMTP with isolated test values, keep public signup closed, and never contact your real provider.

HTTPS preview browser checks additionally start two loopback app fixtures on **3104** (preview signup enabled) and **3106** (closed signup). A test-only route forwards a fictional browser-facing HTTPS origin to these HTTP upstreams; no real DNS, certificates or proxy are configured. Leave those ports free too. Run `npm run test:e2e -- preview.spec.ts` for the preview flow or `npm run test:e2e -- auth.spec.ts` for the existing account/origin/recovery-configuration regressions. These focused runs are distinct from a full integrated suite.

### Test mobile planner and Trash (task 013)

Pull the committed changes and use the restart sequence above, including `npm ci`, `npm run db:migrate`, and a successful build before start. The additive `202611130001_work_trash` migration preserves existing work and block references; do not reset the database.

Open a saved project/task/subtask editor and select **Preview Move to Trash**. Review the target, contained-work counts and preserved scheduled blocks, then confirm or cancel. A project includes active tasks/subtasks; a parent task includes active subtasks. Previously trashed descendants remain separate restoration groups. Changed work or scheduled references require reviewing a fresh impact before another explicit confirmation.

Open **Trash**, select its workspace, inspect **View read-only detail**, and choose **Restore** to return that exact group's original IDs/statuses. Restore a required project/parent first when prompted. Existing owners/editors can move and restore workspace work; no permanent purge or new sharing permission is added. Ordinary views/selectors exclude work in Trash. Calendar keeps its reservations with **Work in Trash** and a link to Trash. Existing assignments can be retained or cleared; **Remove** deletes only that block. Restore does not recreate removed blocks or overwrite later assignments.

From a work editor, **Open workspace Trash** and the unavailable-record **Review workspace Trash** link keep unfinished input and close the editor before opening that workspace's Trash. Restore is usable immediately. Pending saves/Trash requests guard navigation; one Back returns to the previous view, where retained work drafts can be reopened.

Calendar mouse drops/moves/resizes save directly with inline feedback and do not open editors. A failed, conflicting or ambiguous gesture keeps a proposal behind **Review draft** / **Review new block draft**. Activate Review deliberately to resolve it. Pending saves disable duplicate actions. Lost Trash/Restore responses keep the original operation key/batch revision for an explicit same-operation retry, including after planner navigation. Reload/sign-out discards memory-only drafts; discarding an unconfirmed intent does not undo a server commit.

Focused checks: `npm run test:e2e -- mobile-surfaces.spec.ts trash.spec.ts calendar-gesture-review.spec.ts`. They cover responsive widths, actual Chromium touch scrolling, canonical card activation, zero dialog mounts during mouse gestures, explicit DST recovery, subtree restoration, lost responses and shared stale edits. Run the full suite after integration. Physical Android and the owner's Ubuntu/proxy/SMTP installation require separate checks.

Focused recovery-navigation checks: `npm run test:e2e -- trash-navigation.spec.ts dialog-history.spec.ts`. These cover direct Restore access from all work-editor views, clean/dirty/uncertain input, pending guards, one-Back history, session failure and account changes.


### Comments and edit history

Open a saved project, task or subtask from Projects, Board or Calendar, then use **Comments** or **Edit history** below the work form. **Add comment** posts plain text; **Edit comment** is available to its author. Posted and edited times use your saved time zone and expose the full UTC timestamp. **Refresh activity** checks shared updates while preserving work/comment drafts. History changes expand to show before/after values. Earlier work is labeled with the recording boundary; earlier edits are not reconstructed.

A comment has a separate revision, so posting does not overwrite work text/status. Keep draft retains unfinished comments during planner navigation in the current account. An unconfirmed post freezes its original input for **Retry comment save**; retry uses the same request key to avoid duplicates. Discarding input cannot undo a request already committed. Reload/closing the tab can lose unsaved input; saving requires a connection.

Trash detail retains comments/history as read-only. Restore the work before posting/editing again; original IDs/authors/timestamps remain intact. The additive `202611140001_comments_activity` migration is required; use the restart sequence above including `npm ci`, `npm run db:migrate`, and a successful build. Do not reset the database.

Focused checks: `npm run test:e2e -- activity.spec.ts` runs desktop and Android emulation. `npm test -- tests/integration/activity.test.ts` exercises scoped permissions/cursors, author-only edits, revisions, retries, no-op/Board history, atomic rollback, membership-lock races and Trash/Restore. Backend activity fixtures use additional loopback port **3116**. Run the complete browser suite after integration; physical Android and your Ubuntu/proxy/mail installation require separate checks.


### Work lists, workspace workflows, tags and sibling order (014–018)

The combined candidate is implemented for coordinator review; review is not claimed approved. Use the existing pull/install/migrate/build/restart sequence above. All **14 migrations** must be applied, including comments, lists, workspace workflows, the earlier flag migration, sibling order and custom-tag reconciliation. Do not edit an applied migration or reset your database. `npm ci` generates the Prisma client. After a successful build/restart, reload browser tabs so cached five-column clients use the workspace workflow and tag contracts. Existing block instants/references are preserved. No server deployment was performed by implementation.

In any saved project/task/subtask editor, use **Add checklist** or **Add shopping list** below the work fields. Each named section starts empty; both types may coexist. Save individual rows/sections explicitly. Shopping items have quantity, vendor and Purchased; checking rows never completes work. Manage vendor choices from the shopping controls. Archive/Restore sections/items is separate from workspace Trash. Trash detail shows lists read-only; restoring work preserves their IDs and earlier archive states. Unconfirmed creates keep the original request for Retry; uncertain input stays visibly unsaved.

Open **Workspaces**, select a workspace and use its **Task workflow** section. Owners can edit status names/order/completion/default, add definitions and retire choices. Preview impact and explicitly confirm. Occupied retired statuses require replacement choices; restoring Trash that used a retired status asks for a replacement then. The Board groups each selected workspace's workflow separately. Completion comes from saved metadata, and scheduling never changes status. For a name swap, rename one definition to an unused intermediate name first.

In a task/subtask editor, use **Find existing tag**. Type to see existing workspace suggestions; use arrows/Enter or touch a suggestion, then save the task to assign it. **Create/manage tags** opens the scoped Settings manager while retaining unfinished work/comment/list input. In **Settings → Workspace**, choose a workspace, then **Create tag** or **Edit tag** for definition changes. Typing alone creates nothing. Definitions have independent revisions and existing archived associations remain readable. Use **Remove tag** to review all active/Trash usage, download a complete CSV and explicitly **Remove anyway** (or **Remove unused tag**). Confirmation detaches that tag and archives its definition, retaining identity/history. A changed review must be refreshed; nothing is partially removed. **Removal reports** keeps the original usage for later inspection/download. Restore an archived definition by unchecking **Archived tag** and saving; this does not retag former work. Restore trashed work first, then deliberately reattach selected tags in normal task editors. Removing one task association does not remove its definition. Old clients cannot directly archive an in-use active tag without reviewed removal. Any earlier Important/Urgent true flags migrate to ordinary tags; no competing flag model remains. Projects keep their original automatically assigned colors.

Projects, Board and Calendar share compact **Project** and **Tags** multi-select dropdowns, inline search, **Advanced** and **Clear filters**. Search dropdown choices, select several checkboxes, and use Done, Escape, outside click or Back to close. Project/tag/search changes apply immediately. **Advanced** contains tag Any/All, Board/Calendar workspace visibility, Projects/Board created/edited dates, and Board-only **Hide completed**. Apply confirms; Cancel/Back leaves the current filters and all unrelated drafts intact. Failed preference saves keep the proposal for retry. Dates include the whole selected day in your display zone. Completion follows workspace metadata, including multiple completed definitions with renamed labels.

Projects searches project/task/subtask titles and retains necessary ancestry without counting context as matches; active restrictions disable incomplete sibling ordering. Board searches task titles. Calendar's **Search work and blocks** includes titles/descriptions, displayed project/parent names and block labels, excluding comments/history. Categories combine with AND; selected projects combine with OR, and task tags match within their own workspace. Project-only/empty blocks have no tags. Clear resets restrictions while retaining the view's workspace selection. Out-of-scope selections show clear-recovery feedback; hidden work and retained drafts stay saved/reviewable. Filters remain per-account browser memory; Board/Calendar workspace selections remain independently saved. Calendar's selected scope also controls its palette/counts/drop sources; explicit block-editor destinations and retained drafts remain separately available without widening visibility (023).

In Projects, click/tap a task row to edit. Drag the row with a mouse, or hold still for about **350 ms** before moving on touch. Neighbours move to preview the proposed position before release; hover does not save. The compact **Actions → Move up/down** menu provides keyboard and precise non-drag alternatives. Root tasks reorder only within their project; subtasks only within their own parent. Swipe before the hold activates to scroll. Clear task filters/reload incomplete siblings before moving. Order is shared, independent of content revisions, and new siblings append. Trash keeps inactive slots: A/B/C → Trash B → C before A → Restore yields C/B/A, preserving the later active order. Standalone roots, project order, Board order and reparenting are outside this feature. A conflict/uncertain move keeps a reviewable proposal; a same-intent retry cannot undo a later collaborator move.

**Refresh activity** in a still-open restored editor now recovers work/comment controls while retaining original draft revisions. A stale Save still requires explicit conflict review. Failed or obsolete activity loads do not unlock another inactive editor.

Focused checks after a build and guarded test migrations:

```powershell
npm test -- tests/integration/activity.test.ts tests/integration/work-lists.test.ts tests/integration/workflows-order-labels.test.ts
npm run test:e2e -- activity.spec.ts work-lists.spec.ts workflow.spec.ts task-labels.spec.ts task-order.spec.ts
```

Lists HTTP fixtures additionally use **3117**, workflows/tags/order use **3118**. Leave all earlier app/SMTP test ports free. Run the complete `npm test` and `npm run test:e2e` after integration. Current Windows verification uses the existing portable PostgreSQL cluster on loopback **15432** because Windows reserves this checkout's saved **55432** port; ignored process-only wrappers supply guarded test URLs without changing saved `.env` files. This workaround is local evidence, not a new Ubuntu port requirement. Physical Android, Ubuntu/proxy/TLS/Mailcow and real provider delivery remain separate checks.

The task 017 review correction preserves selected tags, including archived associations, when a failed Board move is reopened for explicit recovery. Conflicts still require reviewing the newer saved version before rebasing a proposal. Tags migrated from earlier Important/Urgent flags retain their original IDs and can be renamed, recolored, archived and restored normally. This correction requires a rebuild/restart and browser reload, with no new migration or database reset. Independent re-review passed at `2742d15`; both P2 findings are closed. See `docs/handoff.md` for actual checks and limits. Focused regressions: `npm run test:e2e -- tag-recovery.spec.ts board.spec.ts task-labels.spec.ts` and `npm test -- tests/integration/workflows-order-labels.test.ts`. The three new real-mouse Board cases intentionally skip Android; migrated-tag explicit editing runs on both profiles.

### Stable save feedback (025; independently accepted)

Calendar saves keep the current date/view/scope and grid/document position. Acknowledged reservations update locally before the normal authoritative refresh. Saving/confirmation/error feedback has reserved space, and the shared confirmation notice does not push the page down. Retained input remains available after closing its editor or after a failed gesture.

Required account checks still conceal protected content and pause interaction. The planner stays mounted behind a generic veil, preserving its geometry; dialogs temporarily release native modality so **Retry session check** remains reachable. Same-account verification restores their input focus and internal scroll. A failed gate stays paused until explicit revalidation, and older replies cannot silently reopen it. Account changes/logout still clear account-bound state and navigate normally. This is not offline editing or a verification bypass.

No migration, dependency or environment change is added; all **16 existing migrations** remain required. Independent review accepted `7d4fa4c` with no actionable findings: 172 backend checks and 30 focused browser passes/two intentional Android mouse-only skips. The supplied complete run (206 passes/14 skips) remains separately attributed to the implementer; see the handoff for verification and device limits. Use the existing update/migrate/build/restart/browser-reload sequence. Focused checks after a successful build: `npm test -- tests/unit/planner-session.test.ts` and `npm run test:e2e -- stable-save-feedback.spec.ts session-isolation.spec.ts`. See [025](docs/tasks/025-stable-save-feedback.md) for actual results and limits. Task 026 is independently accepted at `427ed1d`; its gestures are described below.

### Touch dragging and live sibling feedback (026; independently accepted)

On Projects rows, Board cards and Calendar work cards, click/tap edits. Touch dragging starts after a stationary **350 ms** hold; moving more than **8 px** before that cancels drag intent and leaves native scrolling available. Mouse dragging starts after **8 px** of movement. Actions/disclosure controls and nested rows keep their own behavior. Only drag activators suppress text selection; descriptions, notes, comments and form input remain selectable.

Projects previews positions within the original complete sibling group, with **6 px** midpoint hysteresis and reduced-motion support. A release saves at most one move; no-op, cancellation and hover save none. Board dragging changes the task's workspace status, without adding column ordering. Calendar work cards can be held/dragged onto valid blank slots or empty blocks; existing assignment, selected-workspace, duration, DST and recovery rules still apply. Hold a saved event to move it. Hold and release without moving to reveal its resize handles; then hold a handle and drag to resize. A short tap opens its editor. **New block**, status editors and Actions → Move remain available without dragging.

Custom palette/row gestures have bounded edge scrolling. Saved Calendar events scroll only their current pane after physical movement; holding outside Calendar leaves the document still. Stationary selection holds reveal resize handles without saving. Independent review at `427ed1d` closed the original native-scroll P2 and lifted the 026 hold. Escape, second finger, touch cancellation, navigation, resize, an opened dialog or invalidated account/scope cancels the gesture. Release/cancel does not unexpectedly open an editor; a later intentional click/tap still does. Nothing is saved offline. No new dependency, migration or environment setting is introduced; retain all 16 migrations and use the existing build/restart/browser-reload sequence.

After a successful build and guarded test migrations:

```powershell
npm test -- tests/unit/sibling-preview.test.ts tests/integration/workflows-order-labels.test.ts tests/unit/calendar.test.ts
npm run test:e2e -- native-scroll-boundary.spec.ts touch-gestures.spec.ts drag-cancellation.spec.ts task-order.spec.ts board.spec.ts calendar-drop-preview.spec.ts
npm run test:e2e -- stable-save-feedback.spec.ts session-isolation.spec.ts tag-recovery.spec.ts
```

Independent review accepted `427ed1d`: lint/types/schema/all-16 migration status/Webpack, 178 backend checks and 30 focused browser passes/two intentional Android mouse-only skips. All ten new native-scroll cases passed, and the unchanged reviewer-owned probe confirmed zero outside-pointer page movement, zero writes and revision 1 on desktop/Pixel 7. The supplied implementer complete run (236 passes/14 intentional skips, 250 total, 54.5 minutes) remains separate from coordinator reruns. Run the complete suites after later changes. Pixel 7 is genuine Chromium touch emulation, not physical Android; other engines/screen readers and the owner's server remain separate checks. See [the correction review](docs/tasks/026-review-fixes.md#independent-correction-review--2026-11-18) and [handoff](docs/handoff.md) for exact results and limits.

### Calendar scope and views (023; independently accepted)

Use **Advanced → Follow creation workspace** to follow the sidebar default, or **Selected workspaces** to choose several or none. This preference is account-saved independently of Board. Accounts without a prior Calendar selection start in Follow; all existing saved arrays, including empty, migrate to Selected workspaces. Palette cards, project/tag choices, counts, grid, Agenda and drag sources use the selected authorized scope. A revoked Follow default falls back to personal; a custom empty selection stays empty. Clear filters does not change scope.

Choose **Day**, **Week** or **Agenda (week)** next to the date. Agenda replaces the grid with compact chronological rows; it is no longer a duplicate section below the grid. **New block** and **Edit**/event activation keep touch/keyboard scheduling available. Project/task/subtask tints use the same stable project palette as Board; standalone/empty blocks are neutral. Explicit creation outside the view is acknowledged without widening it, and retained drafts remain separately reviewable.

After owner integration/review, use the restart sequence above, including **npm ci**, **npm run db:migrate**, a successful Webpack build, restart, and browser reload. The new migration preserves old selections and existing work/block data; there are **16 migrations**. Back up real data before applying migrations. Keep the server's ignored environment and database; no reset/new setting/dependency is required.

Focused checks after a successful build and guarded test migrations:

```powershell
npm test -- tests/unit/calendar-presentation.test.ts tests/unit/calendar-drop.test.ts tests/integration/workspaces.test.ts
npm run test:e2e -- calendar-presentation.spec.ts calendar-drop-preview.spec.ts calendar.spec.ts calendar-gesture-review.spec.ts compact-filters.spec.ts
```

See [task 023](docs/tasks/023-calendar-presentation-and-workspace-scope.md) for actual verification and limitations. No production deployment is performed.

### Live Calendar drop feedback (019; presentation updated by 023)

Drag a project/task/subtask from Calendar's work palette over a visible day/week grid. A clipped boundary contains the proposed time and title before release, using the same compact presentation/project tint as the saved event (023). Full dates, offsets, viewing zone and interval remain accessible. An empty block in the same workspace previews assignment to its original interval. Occupied/foreign blocks and retained or pending intents show **Unavailable**. Hover saves nothing; a normal release schedules directly without opening an editor. Repeated or missing local times retain the explicit **Review** flow. A clipped shape still labels the full interval, including a next-day endpoint.

Scrolling with the pointer held recomputes the target. Escape, release and invalidated filters/range/work/session clear feedback. Resizing the browser cancels the current mouse drag; begin a fresh drag afterward. The preview does not change workspace ownership or filtering; unselected-workspace cards and their drop sources are excluded (023). Explicit New block/editor choices may still use authorized work outside the view, without adding that workspace to the display. Calendar text search matches titles/descriptions, project/parent names and block labels; status-only context is excluded. Task 026 adds deliberate touch holds for palette scheduling and saved-event move/resize; native pre-hold scrolling and **New block** remain available.

Focused checks after a successful build and guarded test migrations:

```powershell
npm test -- tests/unit/calendar-drop.test.ts
npm run test:e2e -- calendar-drop-preview.spec.ts calendar-gesture-review.spec.ts calendar.spec.ts 011-overflow.spec.ts task-labels.spec.ts dialog-history.spec.ts mobile-surfaces.spec.ts trash-navigation.spec.ts
```

Held-mouse preview cases intentionally skip Android emulation; existing cases retain touch scrolling, explicit scheduling, DST and history coverage. Task 019 was independently accepted; task 023 updates presentation/scope and passed independent review at `499cfd3`. See the task records for actual results and limits. These changes do not deploy or configure your server.

### Settings and appearance (020 candidate)

Current independently accepted candidate is `427ed1d` (026 and its native-scroll correction), carrying accepted `7d4fa4c` (025), `499cfd3` (023) and `fb0ee56` (022), Settings/tag removal and closed authentication P1 (024). The 026 P2 is independently closed and its hold is lifted; the handoff separates coordinator verification from the implementer's complete-browser pass. All **16 existing migrations** remain required; 026 adds none. Use the existing install/migrate/build/restart sequence, preserve the server's `.env` and data, and reload browser tabs. No new package, environment setting or database reset is needed. This review does not deploy your server.

Open **Settings → Account** to save your preferred time zone or **Appearance: System / Light / Dark**. Each Save submits only its own field. System is the adopted default and follows the device; explicit modes override it and persist on your account across devices. A failed save retains the selected input and remains unconfirmed. Appearance is rendered from a read-only account lookup before ordinary paint; signed-out identity uses System. OS changes do not save a preference, reset planner providers or move schedules.

In **Settings → Workspace**, the selector affects only this manager. It does not change the sidebar creation workspace or Board/Calendar selections. Search the compact tag list; use **Create tag**, **Edit tag**, the named color swatches and **Save tag definition**. Editing supports rename/recolor and restoring an archived definition. Use task 021's **Remove tag** flow below for reviewed detachment/archive; legacy archived associations remain readable. Members retain tag content rights, while existing owner-only workspace settings and allowlisted invitation administration keep their permissions.

Task editors keep assigned chips and existing-tag autocomplete. Their **Create/manage tags** link preserves unfinished task/comment/list input through the existing editor navigation guard. Recover retained metadata through **Review retained input** or the Settings **Retained tag definitions** list. Recovery keeps the original workspace, revision and request key, including migrated Important/Urgent IDs and uncertain requests; it does not require restoring the origin task just to manage workspace metadata. Pending definition saves guard dismissal and Back. Unsaved input remains account-bound browser memory and can be lost on reload/closing the tab.

Focused checks after a successful build and guarded test migrations:

```powershell
npm test -- tests/integration/workspaces.test.ts tests/integration/workflows-order-labels.test.ts
npm run test:e2e -- settings-appearance.spec.ts settings.spec.ts task-labels.spec.ts tag-recovery.spec.ts invitations.spec.ts dialog-history.spec.ts
```

The new Settings cases run on desktop and Pixel 7 touch emulation. Appearance checks include JavaScript-disabled first paint, another browser context and fresh sign-in, OS versus explicit modes, failed/obsolete-account saves, all six tint contrast checks and fresh mode screenshots. Other cases cover local workspace choice, permissions/revocation, repeated metadata recovery, origin-task Trash and new-task Back navigation. The task 020 completion record distinguishes focused attempts from the final integrated suite and records physical-device/server limitations. Schema proofs use separate owned disposable clusters; the existing Windows process-only 15432 adaptation remains local to this checkout.

### Reviewed tag removal and recovery (task 021)

Independent feature review at `4524fd4` passed 156 backend checks and 23 focused desktop/Pixel 7 cases, with three intentional Android mouse-drag skips. No actionable removal defect was found. The separate authentication P1 is now closed at `1e08a80`. The implementer's two full-browser attempts each had one failure and subsequent targeted passes; no all-green final full suite is claimed. See [current handoff](docs/handoff.md).

Settings → Workspace → **Remove tag** reviews the complete workspace usage, independent of planner filters. Preview, CSV download and Cancel make no work changes. The supported atomic scope is 500 affected tasks/subtasks and 10,000 total members in affected Trash batches; larger operations clearly refuse. Unconfirmed removals retain the original operation for **Retry tag removal**; retry reconciles a lost response without undoing later edits. **Review latest impact** is an explicit new review after a known conflict, not automatic rebasing. Existing task/comment/list drafts remain retained; stale task saves show the newer saved version before requiring explicit review of removed tags.

No new migration/dependency is added by 021; keep all 15 existing migrations applied, rebuild/restart and reload browser tabs. Reports use existing workspace-owned receipts and authorized reads; they include original titles/context and require current membership. CSV cells are quoted and formula-neutralized for spreadsheet use. Restoring definitions never bulk-retags work; automatic undo/purge is deferred.

Focused checks: `npm test -- tests/integration/tag-removal.test.ts tests/unit/tag-usage-csv.test.ts` and `npm run test:e2e -- tag-removal.spec.ts task-labels.spec.ts tag-recovery.spec.ts trash.spec.ts activity.spec.ts task-order.spec.ts settings-appearance.spec.ts`. Backend removal fixtures use loopback **3119**. Run the complete backend/browser suite after integration. Verification results and platform limitations are in [task 021](docs/tasks/021-tag-removal-and-usage-export.md).

### Authentication form submission safety (024; independently accepted)

Sign-in, permitted sign-up, recovery and invitation forms require JavaScript. Controls stay disabled while their handlers load, with an accessible preparing message and a JavaScript-required instruction when scripts are disabled. If the form stays unavailable, enable JavaScript/allow the site's scripts and reload. Normal confirmation, validation, pending/retry, password reset and account/session behavior remain in the existing auth flows.

HTML forms explicitly use POST to a fixed, reject-only native fallback. A browser/autofill caller bypassing normal disabled controls cannot put password fields in a native GET URL or authenticate through that fallback. The endpoint returns a fixed error without reading/reflection/forwarding of the body, redirects, cookies or token/account changes. Normal credential requests still go through the existing authenticated/Origin-protected APIs. Public production signup and invitation allowlists are unchanged.

No new package, environment variable, schema or migration is needed. All 15 existing migrations remain required. Independent task 024 review at `1e08a80` closed the P1 and lifted the deployment hold. Use the existing install/migrate/build/restart procedure and reload browser tabs. This review does not deploy the server or investigate/clean existing histories/logs; no real credential exposure was established by the isolated reproduction.

Focused verification uses the production Webpack build and guarded test database:

```powershell
npm run check
npm run build -- --webpack
npm test
npm run test:e2e -- auth-submission-safety.spec.ts auth.spec.ts password-recovery.spec.ts invitations.spec.ts preview.spec.ts session-isolation.spec.ts
```

The new browser cases exercise absent/blocked/genuinely delayed scripts, button/Enter/simulated-autofill/direct-native submission and hydrated auth/session behavior on desktop/Pixel 7. They use disposable input, abort unsafe attempted navigations only after observing them, close populated contexts before assertions, and keep traces/video/populated-form screenshots off. Real password-manager products, physical Android and the Ubuntu/proxy/provider installation require separate checks. Actual commands/results and remaining limits are recorded in [task 024](docs/tasks/024-auth-form-submission-safety.md); focused results are not a claim of a complete integrated-suite pass.

Task 024 coordinator verification passed lint/types/schema/all-15 status/Webpack, **156/156 backend checks** and **34/34 focused desktop/Pixel 7 cases with no skips**. A separate probe independently verified safe POST/no credential URLs in all eight original reproduction combinations. The implementer's 48-pass/six-skip selection remains separate carried evidence. No new whole-application browser-suite pass is claimed; see the task record for scope and platform limits.


### Compact filter verification (022)

After a successful build and guarded test setup, run:

```powershell
npm run check
npm test -- tests/unit/compact-filters.test.ts tests/unit/planner-settings.test.ts tests/unit/calendar-drop.test.ts
npm run build -- --webpack
npm run test:e2e -- compact-filters.spec.ts task-labels.spec.ts board.spec.ts task-order.spec.ts
```

Independent review accepted the staged 022 candidate above `1e08a80` with no actionable findings: lint/types/schema/all-15 migration status/Webpack, 161 backend and 25 focused browser passes/three intentional Android mouse-only skips. The task record separates these from implementer complete-suite failures and subsequent passing corrections; no new all-green complete application browser run is claimed. Run the complete browser suite after integration. These changes add no migration or dependency; the existing 15 migrations remain required. Browser verification uses desktop Chromium and Pixel 7 emulation; physical Android and your server/proxy remain separate checks. See [task 022](docs/tasks/022-compact-planner-filters.md) for actual evidence and review status.
