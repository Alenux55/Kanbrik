# 010: HTTPS preview access and account registration

Status: Implemented and locally verified on 2026-11-08, based on `da206b5`. Owner requested LAN/VPN access on server `10.0.0.95`, new accounts for other users, and an HTTPS subdomain through their existing Nginx Proxy Manager. No domain was supplied, so the README uses a hostname placeholder.

## Outcome and scope

The app supports an explicitly enabled HTTPS preview signup policy. Existing local/test loopback signup is preserved, and production mode still denies signup. New users get independent personal workspaces and can be granted editor access to shared workspaces through the existing owner flow. This adds no read-only role, invitation, verified-email policy, schema or migration.

- `KANBRIK_ENV=preview` plus `ENABLE_PREVIEW_REGISTRATION=true` plus an HTTPS `BETTER_AUTH_URL` are all required for preview signup. The same mode with the flag false closes signup while retaining sign-in for existing accounts. Anyone able to reach the enabled preview can register; audience restriction belongs to the owner's LAN/VPN/proxy configuration.
- The browser-facing origin is the HTTPS subdomain. The proxy terminates TLS and uses HTTP to the app's port 3005. Host/protocol headers, exact trusted Origin checks, secure cookies, server workspace membership and account preconditions are preserved.
- Next's existing hostname override binds to `10.0.0.95` when the proxy needs that upstream; a proxy directly on the Ubuntu host may keep `127.0.0.1`. The database remains on loopback. No global binding default changes.
- README documents server-side environment/restart, proxy reachability, independent accounts/shared membership and closing signup. Auth form wording now applies to both local and preview accounts.
- Use HTTPS for browser access. The proposed direct HTTP LAN instructions were superseded by the owner's proxy choice. No insecure-cookie override or browser API workaround is needed.

## Acceptance and verification

1. Local/test signup requires its existing loopback opt-in. Preview signup requires its separate mode/flag/HTTPS tuple. Production signup remains disabled with both flags set. Unit tests cover the policy matrix.
2. Browser tests proxy a fictional HTTPS origin to isolated loopback test servers, asserting signup, secure HttpOnly cookies, session persistence on reload, Calendar creation, untrusted-Origin rejection, closed-signup server denial and existing-account sign-in with the same personal workspace afterward. Run on desktop and Android emulation. Test-only request routing touches no real DNS, certificate, reverse proxy or server.
3. Run lint/types, production build, guarded backend suite and relevant auth/preview browser regressions. Distinguish these focused checks from a full integrated suite. Preserve existing data and use owned disposable fixtures only.
4. Stage task-owned files and provide a commit message. The owner commits/pushes and performs DNS/proxy/server configuration. Do not claim deployment or real server reachability from local tests.

## Completion evidence

- `npm run check`: lint and strict TypeScript passed on the final code/tests.
- `npm run build -- --webpack`: production build passed on the final runtime sources. Test-selector/proxy-teardown corrections afterward changed only the test harness, not the built app. No default Turbopack rerun is claimed.
- `npm run test`: **76/76** passed across six files, including the prior 74 backend/HTTP/database/time/email checks and two preview/local/production registration-policy cases. Test targets and SMTP stay guarded/loopback-only. No schema, migration or dependency change.
- `npm run test:e2e -- auth.spec.ts`: **8/8** passed in 1.6 minutes across desktop and Android emulation. Existing signup/sign-in, disabled production signup with both flags present, untrusted origins, keyboard behavior and recovery-configuration rejection remain effective.
- Final `npm run test:e2e -- preview.spec.ts`: **2/2** passed in one focused run (39.3 seconds) across desktop and Android emulation. Checked the simulated HTTPS-to-HTTP proxy flow, opt-in signup, secure HttpOnly session cookies, reload persistence, Calendar creation, foreign-Origin rejection, closed-signup server rejection and successful existing-account sign-in with the same personal workspace afterward.
- Earlier focused preview attempts failed due to proxy-handler teardown/background requests and an overly exact label-text locator. The harness now handles context teardown explicitly, waits for the final workspace control and uses its accessible combobox name. Those attempts are not presented as passes. App authentication behavior was not weakened to repair the tests.
- Documentation links and diff whitespace checks passed. The full integrated 58-case browser suite, physical Android, actual Ubuntu server, NPM configuration, DNS/certificates, provider email, new audit and deployment were not tested/performed. HTTPS frontend behavior is simulated with browser routing, not a real TLS transport/certificate validation test.

No Ubuntu, DNS, reverse proxy, firewall, certificate, SMTP provider or real-account changes have been performed by the agent. The owner's actual subdomain and proxy topology remain configuration inputs for their server setup. Task-owned files are staged for the owner; no commit/push/deployment. Suggested commit: `feat: support HTTPS preview registration behind a reverse proxy`.
