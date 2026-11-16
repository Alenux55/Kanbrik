import { randomUUID } from "node:crypto";
import { devices, type Browser, type Page } from "@playwright/test";
import { test, expect } from "./base";

const origin = "http://127.0.0.1:3100";
const fallback = "/auth/form-unavailable";
test.setTimeout(120000);
test.use({ trace: "off", video: "off", screenshot: "off" });

type Observation = {
  unsafeNavigation: boolean;
  unsafeReferrer: boolean;
  methods: string[];
  targets: string[];
  bodyFields: string[][];
  nativeStatus: number | null;
  reflectedSecret: boolean;
  setCookie: boolean;
};
const observation = (): Observation => ({
  unsafeNavigation: false,
  unsafeReferrer: false,
  methods: [],
  targets: [],
  bodyFields: [],
  nativeStatus: null,
  reflectedSecret: false,
  setCookie: false,
});
async function owned(
  browser: Browser,
  isMobile: boolean,
  javaScriptEnabled = true,
  baseURL = origin,
) {
  return browser.newContext({
    baseURL,
    javaScriptEnabled,
    ...(isMobile
      ? devices["Pixel 7"]
      : { viewport: { width: 1440, height: 900 } }),
  });
}
function watch(page: Page, secrets: string[]) {
  const result = observation();
  let exercise = false,
    arrived!: () => void;
  const navigation = new Promise<void>((r) => (arrived = r));
  const contains = (value: string) =>
    secrets.some(
      (secret) =>
        value.includes(secret) || value.includes(encodeURIComponent(secret)),
    );
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (
      contains(r.url()) ||
      [...url.searchParams.keys()].some((k) => /password|confirmation/i.test(k))
    )
      result.unsafeNavigation = true;
    if (contains(r.headers().referer ?? "")) result.unsafeReferrer = true;
    if (exercise && r.isNavigationRequest()) {
      result.methods.push(r.method());
      result.targets.push(url.pathname);
      result.bodyFields.push([
        ...new URLSearchParams(r.postData() ?? "").keys(),
      ]);
      arrived();
    }
  });
  // Detect the attempted unsafe navigation before aborting it. This does not
  // prevent the browser from attempting submit, and never logs a raw URL/value.
  return {
    result,
    navigation,
    begin: () => {
      exercise = true;
    },
    contains,
  };
}
async function fillProperties(
  page: Page,
  signUp: boolean,
  email: string,
  password: string,
) {
  await page.locator("form").evaluate(
    (node, values) => {
      const form = node as HTMLFormElement;
      for (const [name, value] of Object.entries(values)) {
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    },
    {
      email,
      password,
      ...(signUp
        ? { name: "Disposable safety probe", confirmPassword: password }
        : {}),
    },
  );
}
async function pointerSubmit(page: Page, isMobile: boolean, signUp: boolean) {
  const button = page.getByRole("button", {
    name: signUp ? "Create account" : "Sign in",
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw Error("Submission control is missing.");
  if (isMobile)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function quiet() {
  await new Promise((r) => setTimeout(r, 250));
}

for (const mode of ["JavaScript disabled", "scripts blocked"] as const)
  for (const path of ["/sign-in", "/sign-up"] as const) {
    test(`${path} has safe native submission with ${mode}`, async ({
      browser,
      isMobile,
    }) => {
      const signUp = path === "/sign-up",
        password = randomUUID() + randomUUID(),
        email = randomUUID() + "@example.invalid";
      const results = [];
      // Each native attempt gets a fresh page: a fallback navigation must not hide
      // or repair the next exercise. Close populated contexts before assertions so
      // failure diagnostics cannot capture credential fields or an unsafe URL.
      for (const action of [
        "button",
        "Enter",
        "autofill requestSubmit",
        "native submit",
      ] as const) {
        const context = await owned(
          browser,
          isMobile,
          mode !== "JavaScript disabled",
        );
        try {
          const page = await context.newPage(),
            probe = watch(page, [password]);
          await page.route("**/*", async (route) => {
            if (
              probe.contains(route.request().url()) ||
              /[?&](?:password|confirmPassword)=/i.test(route.request().url())
            )
              return route.abort();
            if (
              mode === "scripts blocked" &&
              route.request().resourceType() === "script"
            )
              return route.abort();
            return route.continue();
          });
          await page.goto(path, { waitUntil: "domcontentloaded" });
          const markup = await page
            .locator("form")
            .evaluate((form) => ({
              method: form.getAttribute("method"),
              action: form.getAttribute("action"),
              disabled:
                (form.querySelector("fieldset") as HTMLFieldSetElement | null)
                  ?.disabled === true,
              waiting: !!form.querySelector('[role="status"]'),
              noScript: !!form.querySelector("noscript"),
            }));
          await fillProperties(page, signUp, email, password);
          probe.begin();
          const rejected =
            action === "autofill requestSubmit" || action === "native submit"
              ? page
                  .waitForResponse(
                    (r) =>
                      r.request().isNavigationRequest() &&
                      new URL(r.url()).pathname === fallback,
                    { timeout: 3000 },
                  )
                  .catch(() => null)
              : undefined;
          if (action === "button") await pointerSubmit(page, isMobile, signUp);
          else if (action === "Enter") {
            await page
              .getByLabel(signUp ? "Confirm your password" : "Password", {
                exact: true,
              })
              .evaluate((input) => (input as HTMLInputElement).focus());
            await page.keyboard.press("Enter");
          } else
            await page.locator("form").evaluate((element, native) => {
              const form = element as HTMLFormElement;
              if (native) {
                // Simulate an external autofill/native caller bypassing the disabled
                // fieldset. The HTML POST destination must remain safe independently.
                form
                  .querySelectorAll("fieldset")
                  .forEach((f) => (f.disabled = false));
                HTMLFormElement.prototype.submit.call(form);
              } else form.requestSubmit();
            }, action === "native submit");
          await quiet();
          if (probe.result.methods[0] === "POST") {
            const response = await rejected;
            const body = response ? await response.text() : "";
            probe.result.reflectedSecret = body.includes(password);
            if (response) {
              probe.result.nativeStatus = response.status();
              probe.result.setCookie =
                response.headers()["set-cookie"] !== undefined;
            }
          }
          const targetHasSecret = probe.contains(page.url());
          results.push({ action, markup, ...probe.result, targetHasSecret });
        } finally {
          await context.close();
        }
      }
      for (const result of results) {
        expect(result.unsafeNavigation).toBe(false);
        expect(result.markup).toEqual({
          method: "post",
          action: fallback,
          disabled: true,
          waiting: true,
          noScript: true,
        });
        expect(result.unsafeNavigation).toBe(false);
        expect(result.unsafeReferrer).toBe(false);
        expect(result.targetHasSecret).toBe(false);
        expect(result.reflectedSecret).toBe(false);
        expect(result.setCookie).toBe(false);
        if (result.action === "button" || result.action === "Enter")
          expect(result.methods).toEqual([]);
        else {
          expect(result.methods).toEqual(["POST"]);
          expect(result.targets).toEqual([fallback]);
          expect(result.nativeStatus).toBe(400);
        }
        if (result.action === "native submit")
          expect(result.bodyFields[0]).toContain("password");
      }
    });
  }

for (const path of ["/sign-in", "/sign-up"] as const)
  test(`${path} becomes usable after delayed hydration and preserves autofill, validation and pending exclusion`, async ({
    browser,
    isMobile,
    testAccounts,
  }) => {
    const context = await owned(browser, isMobile),
      password = randomUUID() + randomUUID(),
      email = randomUUID() + "@example.invalid",
      signUp = path === "/sign-up";
    testAccounts.push(email);
    let releaseScripts!: () => void,
      releaseAuth!: () => void,
      authArrived!: () => void;
    const scripts = new Promise<void>((r) => (releaseScripts = r)),
      auth = new Promise<void>((r) => (releaseAuth = r)),
      arrived = new Promise<void>((r) => (authArrived = r));
    const metrics = {
      beforeReadyDisabled: false,
      beforeCalls: 0,
      ready: false,
      autofillKept: false,
      pendingDisabled: false,
      calls: 0,
      signedIn: false,
      unsafeNavigation: false,
      unsafeReferrer: false,
      storageSecret: false,
      hydrationError: false,
    };
    try {
      if (!signUp) {
        const response = await context.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: { email, password, name: "Delayed sign-in" },
        });
        if (response.status() !== 200)
          throw Error("Disposable account setup failed.");
        await context.clearCookies();
      }
      const page = await context.newPage(),
        probe = watch(page, [password]);
      page.on("pageerror", () => {
        metrics.hydrationError = true;
      });
      page.on("console", (message) => {
        if (/hydrat|didn.t match/i.test(message.text()))
          metrics.hydrationError = true;
      });
      await page.route("**/*", async (route) => {
        const r = route.request();
        if (probe.contains(r.url())) return route.abort();
        if (r.resourceType() === "script") await scripts;
        const url = new URL(r.url());
        if (
          r.method() === "POST" &&
          url.pathname ===
            (signUp ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email")
        ) {
          metrics.calls++;
          authArrived();
          await auth;
        }
        return route.continue().catch(() => {});
      });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await fillProperties(page, signUp, email, password);
      metrics.beforeReadyDisabled = await page
        .getByLabel("Password", { exact: true })
        .isDisabled();
      await pointerSubmit(page, isMobile, signUp);
      await page.keyboard.press("Enter");
      await quiet();
      metrics.beforeCalls = metrics.calls;
      releaseScripts();
      await page.waitForFunction(
        () =>
          document.querySelector("form")?.getAttribute("aria-busy") === "false",
      );
      metrics.ready = true;
      metrics.autofillKept = await page
        .getByLabel("Password", { exact: true })
        .evaluate(
          (input, value) => (input as HTMLInputElement).value === value,
          password,
        );
      // Keyboard implicit submit is still handled by the existing auth path.
      await page
        .getByLabel(signUp ? "Confirm your password" : "Password", {
          exact: true,
        })
        .focus();
      await page.keyboard.press("Enter");
      await arrived;
      metrics.pendingDisabled = await page
        .getByRole("button", { name: "Please wait…", exact: true })
        .isDisabled();
      await pointerSubmitPending(page, isMobile);
      await page.keyboard.press("Enter");
      await quiet();
      releaseAuth();
      await page.waitForURL("**/projects");
      await page.getByText(`Signed in as ${email}`, { exact: true }).waitFor({ state: "visible" });
      metrics.signedIn = await page
        .getByText(`Signed in as ${email}`, { exact: true })
        .isVisible();
      metrics.storageSecret = await page.evaluate(
        (value) =>
          [localStorage, sessionStorage].some((storage) =>
            Object.values(storage).some((entry) =>
              String(entry).includes(value),
            ),
          ),
        password,
      );
      metrics.unsafeNavigation = probe.result.unsafeNavigation;
      metrics.unsafeReferrer = probe.result.unsafeReferrer;
    } finally {
      releaseScripts();
      releaseAuth();
      await context.close();
    }
    expect(metrics).toEqual({
      beforeReadyDisabled: true,
      beforeCalls: 0,
      ready: true,
      autofillKept: true,
      pendingDisabled: true,
      calls: 1,
      signedIn: true,
      unsafeNavigation: false,
      unsafeReferrer: false,
      storageSecret: false,
      hydrationError: false,
    });
  });
async function pointerSubmitPending(page: Page, isMobile: boolean) {
  const box = await page
    .getByRole("button", { name: "Please wait…", exact: true })
    .boundingBox();
  if (!box) throw Error("Pending control missing.");
  if (isMobile)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("closed registration still protects the server-rendered sign-in form without scripts", async ({
  browser,
  isMobile,
}) => {
  const context = await owned(
    browser,
    isMobile,
    false,
    "http://127.0.0.1:3102",
  );
    const result = { signInSafe: false, signupClosed: false };
  try {
    const page = await context.newPage();
    await page.goto("/sign-in");
    result.signInSafe = await page
      .locator("form")
      .evaluate(
        (f) =>
          f.getAttribute("method") === "post" &&
          f.getAttribute("action") === "/auth/form-unavailable" &&
          (f.querySelector("fieldset") as HTMLFieldSetElement)?.disabled ===
            true,
      );
    await page.goto("/sign-up");
    result.signupClosed = (await page.locator("form").count()) === 0;
  } finally {
    await context.close();
  }
  expect(result).toEqual({ signInSafe: true, signupClosed: true });
});

test("recovery and invitation forms keep token hydration and safe native POST fallback", async ({
  browser,
  isMobile,
}) => {
  const outcomes: (
    | {
        phase: "no-script";
        path: string;
        passwordFields: number;
        unsafeMethod: number;
      }
    | {
        phase: "hydrated";
        path: string;
        markup: { method: string | null; action: string | null };
        tokenRemoved: boolean;
        unsafe: boolean;
        methods: string[];
        targets: string[];
      }
  )[] = [];
  for (const path of [
    "/forgot-password",
    "/reset-password#token=unusable-probe",
    "/accept-invitation#token=unusable-probe",
  ]) {
    const blocked = await owned(browser, isMobile, false);
    try {
      const page = await blocked.newPage();
      await page.goto(path);
      outcomes.push({
        phase: "no-script",
        path: path.split("#")[0],
        passwordFields: await page.locator('input[type="password"]').count(),
        unsafeMethod: await page.locator('form:not([method="post"])').count(),
      });
    } finally {
      await blocked.close();
    }
    const context = await owned(browser, isMobile),
      password = randomUUID() + randomUUID();
    try {
      const page = await context.newPage(),
        probe = watch(page, [password]);
      await page.route("**/*", async (route) => {
        if (probe.contains(route.request().url())) return route.abort();
        if (
          new URL(route.request().url()).pathname === "/api/invitations/preview"
        )
          return route.fulfill({
            status: 200,
            json: { email: "native-probe@example.invalid" },
          });
        return route.continue();
      });
      await page.goto(path);
      await page.locator("form").waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector("form")?.getAttribute("aria-busy") === "false",
      );
      const markup = await page
        .locator("form")
        .evaluate((form) => ({
          method: form.getAttribute("method"),
          action: form.getAttribute("action"),
        }));
      const tokenRemoved = new URL(page.url()).hash === "";
      probe.begin();
      await page.locator("form").evaluate((node, value) => {
        const form = node as HTMLFormElement;
        form.querySelectorAll("input").forEach((input) => {
          input.value =
            input.type === "email"
              ? "native-probe@example.invalid"
              : input.type === "password"
                ? value
                : "Native probe";
        });
        HTMLFormElement.prototype.submit.call(form);
      }, password);
      await quiet();
      outcomes.push({
        phase: "hydrated",
        path: path.split("#")[0],
        markup,
        tokenRemoved,
        unsafe: probe.result.unsafeNavigation,
        methods: probe.result.methods,
        targets: probe.result.targets,
      });
    } finally {
      await context.close();
    }
  }
  for (const o of outcomes) {
    if (o.phase === "no-script") {
      expect(o.passwordFields).toBe(0);
      expect(o.unsafeMethod).toBe(0);
    } else {
      expect(o.markup).toEqual({ method: "post", action: fallback });
      expect(o.tokenRemoved).toBe(true);
      expect(o.unsafe).toBe(false);
      expect(o.methods).toEqual(["POST"]);
      expect(o.targets).toEqual([fallback]);
    }
  }
});

test("native fallback rejects bodies without echo, auth changes, cookie renewal or redirects", async ({
  browser,
  isMobile,
  testAccounts,
}) => {
  const context = await owned(browser, isMobile),
    email = randomUUID() + "@example.invalid",
    password = randomUUID() + randomUUID();
  testAccounts.push(email);
  const results = [];
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: { name: "Fallback session", email, password },
    });
    if (signup.status() !== 200)
      throw Error("Disposable account setup failed.");
    const session = await (
      await context.request.get("/api/auth/get-session")
    ).json();
    const cookies = JSON.stringify(await context.cookies());
    for (const source of [origin, "https://untrusted.invalid"]) {
      const r = await context.request.post(fallback, {
        headers: { origin: source },
        form: {
          password,
          confirmPassword: password,
          token: password,
          redirectTo: "https://untrusted.invalid",
        },
        maxRedirects: 0,
      });
      const text = await r.text();
      results.push({
        status: r.status(),
        echo: text.includes(password),
        cookie: r.headers()["set-cookie"] !== undefined,
        redirect: r.headers().location !== undefined,
        noStore: r.headers()["cache-control"] === "no-store",
      });
    }
    const after = await (
      await context.request.get("/api/auth/get-session")
    ).json();
    results.push({
      sameSession: session?.session.id === after?.session.id,
      sameUser: session?.user.id === after?.user.id,
      sameCookies: cookies === JSON.stringify(await context.cookies()),
    });
  } finally {
    await context.close();
  }
  expect(results).toEqual([
    { status: 400, echo: false, cookie: false, redirect: false, noStore: true },
    { status: 403, echo: false, cookie: false, redirect: false, noStore: true },
    { sameSession: true, sameUser: true, sameCookies: true },
  ]);
});
