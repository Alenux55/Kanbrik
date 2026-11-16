# 024: Prevent credential URLs before authentication forms hydrate

Status: Original P1 independently closed at owner-committed `1e08a80` on 2026-11-15. No new actionable findings in the correction review; the deployment hold is lifted. Task 021's feature acceptance remains intact, and 022 is ready for a separate assignment. Original reproduction, implementation evidence and current independent verification remain separately recorded below. No deployment was performed by review.

## Outcome and inputs

Sign-in and sign-up must never submit passwords in a URL when JavaScript is unavailable, delayed or fails to load. Keep the existing authentication, registration policy and account/session boundaries. Read AGENTS.md, README, current handoff, identity/session tasks 002/005/006/007/010/012, `src/components/auth-form.tsx`, other credential forms, auth routes and existing browser fixtures before making the bounded correction.

## Confirmed P1 and reproduction

`src/components/auth-form.tsx:32` renders an SSR form with `onSubmit={submit}` but no HTML method/action safeguard. Named password fields and an enabled submit button are already present before the React handler can prevent the browser's native submit. The HTML default is GET to the current page.

The independent ignored `.local/review021-native-auth.mjs` reproduced eight combinations: desktop/Pixel 7, sign-in/sign-up, JavaScript disabled or JavaScript enabled with script loading blocked. Every case attempted native **GET** with `password` in the query; sign-up also included `confirmPassword`. The normal sign-in page remains relevant when public registration is disabled. This is an actual password-in-URL risk, including access-log/history exposure if the navigation reaches the server.

The harness used generated disposable input and intercepted/aborted the credential-bearing navigation before it reached the app. It printed only profile/path/method/field names, never values, full URLs, cookies, screenshots or traces of populated forms. No account was created and no real credential was used. Its owned app on loopback 3115 was stopped. Ordinary hydrated authentication cases passing does not disprove this fallback path.

Task 021 changed only the common planner **test setup** to use the real registration API/context cookies; dedicated UI tests remain. That avoids accidental fixture URL submission but is not an application fix. AuthForm is unchanged from the earlier accepted baseline. Password-reset/invitation forms use hydration-gated rendering; audit their fallback too, without claiming the same prepaint reproduction has already been demonstrated there.

## Required correction

- Make SSR/native form behavior safe independently of React's `preventDefault`. Add appropriate HTML submission defenses and gate an interactive submit until its handling is ready, or provide an equivalent safe existing-stack POST path. An explicit accessible waiting/JavaScript-required state is acceptable; implementing full authentication without JavaScript is not required.
- No password, confirmation or other credential secret may enter a query string, fragment, navigation target, referrer, browser storage, client/server diagnostic message, screenshot or trace. Do not merely rename fields, remove a failing assertion or rely on a disabled-JavaScript test being uncommon. Keep safe behavior on mouse click and implicit Enter/autofill submission.
- Apply the safety invariant to sign-in and permitted sign-up, and audit reset/invitation credential forms. Preserve current fragment-token handling, token removal from address bars, password confirmation, validation, pending/retry behavior, error accessibility and keyboard/touch use after hydration.
- Reuse current Better Auth/API/session machinery and strict Origin/expected-account checks. Do not create a second authentication stack, enable public production signup, weaken invitation controls or change workspace membership. No provider, secret rotation, user-data cleanup or deployment is assigned by this correction.

## Acceptance and verification

1. Real desktop and Pixel 7 browser cases disable JavaScript, block/delay hydration scripts and submit via button/Enter/autofill where applicable. Assert that no credential-bearing GET/navigation occurs. With genuinely delayed scripts, release them and verify normal form interaction works once ready. Inspect the actual request method/target without writing raw credential values or URLs to test output.
2. Retain dedicated normal UI signup/sign-in, invalid credentials, confirmation, disabled deployed signup, invitations and password-reset tests. Keep independent account/session/Origin/expired-token behavior, refresh/sign-out/Back and double-submit protections. API-based planner setup may remain; it is not a substitute for these UI cases.
3. Include a regression that would fail against the current unsafe SSR markup, with trace/video/populated-form screenshots disabled and owned disposable fixtures. Do not accept an assertion that only tests the hydrated handler or a broad route abort that prevents the browser from attempting submission in the first place.
4. Run README lint/types/Webpack, relevant auth/session backend checks and focused desktop/Android browser coverage. Any schema/dependency change needs separate justification; neither is expected. Record exact runs, failures, limits and remaining findings honestly. Do not combine earlier partial runs into a claimed all-green suite.
5. Update task/handoff/README with actual correction evidence and return for independent re-review. Stage only correction-owned files; leave commit/push/deployment to the owner. Do not start 022/023 as part of this security fix.

## Review context

Task 021's tag-removal data/permission/Trash behavior is reviewed separately. Its local lint/types/schema/all-15 migration status/Webpack and **156/156 backend/unit checks across 16 files** passed independently; focused browser results are in the current handoff. Acceptance of the tag feature does not resolve this baseline P1 or approve server deployment while it remains open. No evidence of actual user credential exposure was collected or claimed; the reproduced unsafe submission path is sufficient to require correction.

## Implementation candidate — 2026-11-15

The assigned scope is 024 only, above `4524fd4`. Existing staged coordinator review/planning documentation is preserved. No schema/migration/dependency/secret/registration-policy/workspace-permission change is introduced, and 022/023 are not implemented.

`SafeCredentialForm` now owns the shared native form contract for sign-in, permitted sign-up, reset requests, password reset and invitation acceptance. It renders HTML `method="post"` with a fixed same-origin `/auth/form-unavailable` action. A `useSyncExternalStore` server snapshot keeps the whole fieldset disabled for SSR and initial hydration; controls become interactive after React has attached handling. Existing pending state disables the same fieldset. An accessible preparing state and plain noscript instruction explain unavailable JavaScript. The wrapper prevents default submission even before ready, then invokes the original handlers only when ready and not pending. Original field names, confirmation, validation, retries and credential API calls remain in their existing components.

The explicit HTML POST action is a second defense for browser/autofill/native callers bypassing the disabled controls or React's handler. The reject-only route checks trusted Origin, returns a fixed no-store/nosniff/no-referrer plain-text 400 (403 for foreign/missing Origin), never reads/echoes/forwards the body, does not redirect, and invokes no authentication/session/token/data operation. It sets no cookies. This endpoint grants no identity or access; normal auth APIs retain their existing Origin/account/session checks. Full authentication without JavaScript remains unsupported.

Reset/invitation forms still read/remove their original URL fragments after hydration and keep tokens in memory/POST bodies. Their former prepaint behavior already hid password controls; the shared wrapper additionally protects direct native submission after they render. Reset requests share the guard so email cannot fall back to a native GET either. No token handling, expiry, single-use, signed-in acceptance guard or invitation-admin policy is changed.

### Verification evidence

- Lint/types passed after a test-only prefer-const correction. Schema validation passed; guarded test migration status reports all 15 applied, none pending. Corrected Webpack build passed.
- Before rebuilding, the new native-submission regression was run against the unchanged existing unsafe build: **all eight desktop/Pixel 7 × sign-in/sign-up × JavaScript-disabled/scripts-blocked cases failed**, detecting actual attempted credential-bearing navigation. Own browser contexts were closed before assertions, unsafe requests were observed then aborted before reaching the app, and failure output contained sanitized booleans/field names rather than URLs or values. This is a deliberate red baseline, not a failed run of the correction.
- The regression exercises pointer/touch, implicit Enter, simulated autofill/requestSubmit and direct native submit with the disabled fieldset deliberately bypassed. The latter verifies that HTML POST safety does not rely exclusively on disabled controls or a hydrated handler. Genuine script gates test later activation/autofill preservation and one pending auth request. Additional cases audit reset/invitation native behavior, closed-signup sign-in and the reject endpoint's body/cookie/session invariants. Traces/videos/populated-form screenshots are disabled. Browser password-manager products and physical Android are not claimed verified.
- Final corrected-build results and limits are recorded below. Earlier red/failed attempts are kept separate; no aggregation or whole-application suite pass is claimed.

### Final correction verification — 2026-11-15

- Final `npm run check` passed lint and generated Next/TypeScript checks without warnings. `npm run db:validate` passed. Guarded Prisma migration status reported **15 applied, none pending**. `npm run build -- --webpack` passed with the new reject-only route. No schema, migration, dependency, auth-policy or saved environment change exists; no new persistence proof/migration is needed.
- Full guarded backend/unit run: **156/156 across 16 files, 30.59 seconds, exit 0**. This includes existing account/session/expected-account/Origin protections, password-reset expiry/single-use/session revocation and invitation authorization/transaction behavior. No production database/provider was involved.
- Final combined browser selection: **48 passed / zero failures / six intentional Android mouse-only skips, 54 total, 11.2 minutes, exit 0**. All **18 new safety cases** passed on desktop and Pixel 7; none of the new cases skipped. The eight before-paint combinations that were red on the old build are now green. Each exercises pointer/touch, Enter, simulated autofill requestSubmit and direct native submit with the fieldset bypassed. Rejected native requests reach the fixed POST route; their fields are inspected by name, never logged by value. Fallback tests verify no echo, redirect, cookie renewal, user/session change or auth operation. Genuine delayed scripts are released and normal auth succeeds, retaining prefilled values and excluding a second pending request; no hydration error or credential URL/referrer/storage was observed.
- The selection retains normal UI signup/sign-in, invalid credentials, confirmation, production signup closure, keyboard/touch, invitation acceptance and recovery through local SMTP, HTTPS-preview secure-cookie behavior and delayed renewal/expiry/cross-tab/account/pending-save/session tests. The `preview.spec.ts` filename filter also selected `calendar-drop-preview.spec.ts`: its six desktop cases passed and six Android mouse-only cases skipped. No Calendar implementation changed. This is **focused verification**, not a new complete application browser suite or a replacement for task 021's qualified historical full runs.

Exact local commands (the inspected ignored adapter supplies only process-local guarded loopback 15432 test URLs; portable README equivalents are `npm test` / `npm run test:e2e --` with the same arguments):

```powershell
node .local/task014-command.mjs integration
node .local/task014-command.mjs browser auth-submission-safety.spec.ts auth.spec.ts password-recovery.spec.ts invitations.spec.ts preview.spec.ts session-isolation.spec.ts
```

Earlier corrected-build browser attempt: **14 passed / four failed, 18 total, 3.8 minutes, exit 1**. The four delayed-script cases passed every safety/autofill/readiness/pending/request-count metric but read the signed-in label immediately after navigation, before the planner's session check finished. A test-only wait for that visible signed-in screen fixed the assertion. The final combined run above verifies the correction on unchanged runtime source; it is separate from that failed attempt and from the deliberate eight-case old-build red baseline. No runtime behavior was changed to hide a failing security assertion. The existing keyboard test now waits for the interactive sign-in button before pressing Tab, matching the intentional pre-hydration disabled state.

Four empty/unfilled JavaScript-disabled sign-in/sign-up screenshots were captured on desktop/Pixel 7 only after checking all inputs were blank and disabled. Desktop sign-in and Android sign-up were visually inspected for readable guidance/layout. No populated-form screenshot, trace or video was created. Autofill is simulated DOM/native submission, not a claim of real password-manager integration. Physical Android, other browser engines, Ubuntu/proxy/TLS/Mailcow/provider delivery, fresh dependency install/audit, container runtime, default Turbopack and production deployment/exposure investigation remain unverified/out of scope. Existing reset/invitation fragment-token behavior is deliberately retained, not replaced with query parameters or browser storage.

### Completion handoff

Task 024 is complete for independent re-review, above `4524fd4`. **Do not lift the deployment hold until that review closes the P1.** Existing tag/workspace/data behavior and 022/023 plans remain unchanged. No full authentication without JavaScript, new stack, secret rotation, user-data cleanup, SSH/provider action, commit, push or deployment was performed.

The owned portable PostgreSQL cluster and all app/SMTP fixtures stopped cleanly. A listener check found **3100–3126 and 15432/15434/15435 closed**. Saved `.env`/credentials are unchanged; local proof/log/image/generated artifacts stay ignored. Task-owned files are staged with the eight preserved coordinator input documents (15 files total). Git whitespace/local Markdown links are checked. Proposed commit message: `fix: prevent credential URLs before auth forms hydrate`.

## Independent correction review — 2026-11-15

Reviewed clean owner-committed `1e08a80` against `4524fd4`. The shared readiness gate, explicit HTML POST target and reject-only handler close the demonstrated native GET path without altering normal identity, registration/invitation, session, token-fragment or workspace policy. The fallback reads no body and performs no auth/data/cookie action. No schema, applied migration, dependency or environment change exists. No new actionable defect was found; the original P1 is closed and the deployment hold is lifted.

Independent lint/types, schema validation, all-15 migration status (none pending) and Webpack build passed. The full backend/unit run passed **156/156 across 16 files**, exit 0, after the build completed. Focused browser verification passed **34/34 cases, zero failures/skips, 7.1 minutes, exit 0**. All 18 new safety cases passed on desktop and Pixel 7, including actual delayed script release, preserved autofill, native bypass, pending exclusion, fallback body/cookie/session invariants and recovery/invitation audit. Normal signup/sign-in/error/confirmation/Back, production signup closure, Origin/keyboard behavior, local SMTP recovery/invitations, HTTPS preview/secure cookies and same-cookie cross-tab/account/logout behavior also passed.

Exact focused command used the inspected ignored process-only guarded 15432 adapter (portable equivalent: README `npm run test:e2e --` with the same arguments):

```powershell
node .local/task014-command.mjs browser auth-submission-safety.spec.ts auth.spec.ts password-recovery.spec.ts invitations.spec.ts preview.spec.ts session-isolation.spec.ts --grep 'safe native submission|delayed hydration|closed registration still|recovery and invitation forms|native fallback rejects|signup, session refresh|deployed-mode registration|untrusted auth origins|forgot password explains|password recovery delivers|administrator emails|HTTPS preview accounts|same-cookie tabs'
```

The explicit title filter excludes Calendar preview cases that the filename alone would also match. These coordinator runs are separate from the implementer's 48-pass/six-skip selection and prior qualified whole-application runs; no new complete application browser pass is claimed. No schema preservation rerun was needed for this code-only correction. Physical Android/password-manager products, other engines, Ubuntu/proxy/provider operation, install/audit/default Turbopack/container runtime and historical exposure investigation remain unverified/out of scope.

The separate ignored `.local/review024-native-auth.mjs` independently repeated all eight original desktop/Pixel 7 × sign-in/sign-up × JavaScript-disabled/scripts-blocked combinations on owned loopback app 3115. Even with disabled fieldsets deliberately bypassed, every attempt used POST to `/auth/form-unavailable`, received 400, kept secrets out of URLs/response text and emitted no cookie. Only sanitized methods/field-presence/boolean outcomes were recorded; no populated-form screenshots, traces, credential values or real accounts were used. The owned app and test database were stopped; no review listeners remain. Saved environments are unchanged. Documentation only is updated/staged; no runtime edit, commit, push or deployment was performed by review.
