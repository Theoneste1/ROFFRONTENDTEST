/**
 * The sign-in page in the approved reference design (app/(auth)/login, app/components/shell/AuthShell): one
 * card that fits the window at 1366×768 and 375×667 (the navy panel on large screens, a slim bar on phones), the
 * existing fields and messages (empty fields, wrong credentials for an unknown and for a real account, the backend's
 * rate limit), "Forgot password?" and "Create account" going to their pages, and real sign-ins (username and e-mail)
 * reaching each role's portal. Against the real backend; synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn, signInWith } from "../support/session";
import { ACCOUNTS, passwordOf, type AccountKey } from "../support/accounts";

/**
 * Opens the sign-in page and waits for its form. Opening a page first restores the session (POST /auth/refresh, 30 a
 * minute per address); in a full run every test shares one address, the limit is reached and the app waits it out
 * before showing the form ("Checking your session…"). As in signInWith: allow that wait, added to the test's timeout.
 */
async function openLogin(page: Page) {
  await page.goto("/login");
  const form = page.locator('input[name="username"]');
  if (!(await form.isVisible())) {
    test.info().setTimeout(test.info().timeout + 90_000);
    await form.waitFor({ timeout: 90_000 });
  }
}

const SIZES = [
  { width: 1366, height: 768 },
  { width: 375, height: 667 },
];

/** No page scroll (neither way) and every control of the form inside the window. */
async function fits(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.scrollingElement as HTMLElement;
    if (doc.scrollHeight > doc.clientHeight) problems.push(`the page scrolls (${doc.scrollHeight} > ${doc.clientHeight})`);
    if (doc.scrollWidth > doc.clientWidth) problems.push(`the page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
    for (const el of document.querySelectorAll('[data-testid="login-form"] :is(h1, label, input, button, a, [role="alert"])')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) problems.push(`${el.tagName} "${el.textContent?.trim()}" is outside the window`);
    }
    return problems;
  });
}

test.describe("the sign-in page", () => {
  for (const vp of SIZES)
    test(`at ${vp.width}×${vp.height}: one card that fits, the messages, and the links`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openLogin(page);
      const username = page.locator('input[name="username"]');
      await expect(page.getByTestId("auth-card")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      await expect(page.getByLabel("Username or email")).toBeVisible();
      await expect(page.getByLabel("Password", { exact: false }).first()).toBeVisible();
      // The navy panel on large screens; the slim bar on phones.
      if (vp.width >= 1024) await expect(page.getByTestId("auth-brand-panel")).toBeVisible();
      else await expect(page.getByTestId("auth-brand-bar")).toBeVisible();
      expect(await fits(page)).toEqual([]);
      // Inputs and the button are at least 44px tall (tap targets); the button spans the form.
      for (const el of [username, page.locator('input[name="password"]'), page.getByRole("button", { name: "Sign in" })]) {
        expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }

      // Nothing filled in: the existing messages beside the fields, nothing sent.
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Enter your username or e-mail address.")).toBeVisible();
      await expect(page.getByText("Enter your password.")).toBeVisible();
      expect(await fits(page), "with the messages").toEqual([]);

      // Wrong credentials (an account that does not exist, so no real account is locked): the existing message.
      // (The backend allows 10 sign-ins a minute per address: a 429 waits the window out and tries again.)
      const refused = page.getByRole("alert").filter({ hasText: "The username or password is not correct. Check them and try again." });
      for (let attempt = 1; attempt <= 3; attempt++) {
        await username.fill(`nobody.${vp.width}.${Date.now().toString(36)}`);
        await page.locator('input[name="password"]').fill("Not-The-Password-1!");
        await page.getByRole("button", { name: "Sign in" }).click();
        const limited = page.getByRole("alert").filter({ hasText: /Too many requests/i });
        const outcome = await Promise.race([
          refused.waitFor({ timeout: 30_000 }).then(() => "refused" as const, () => null),
          limited.waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
        ]);
        if (outcome !== "limited") break;
        test.info().setTimeout(test.info().timeout + 70_000);
        await page.waitForTimeout(61_000);
      }
      await expect(refused).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
      expect(await fits(page), "with the refusal").toEqual([]);

      // The links.
      await page.getByRole("link", { name: "Forgot password?" }).click();
      await page.waitForURL((u) => u.pathname === "/forgot-password");
      await openLogin(page);
      await page.getByRole("link", { name: "Create account" }).click();
      await page.waitForURL((u) => u.pathname === "/register");
    });

  test("a real sign-in through the restyled form reaches the portal (phone size)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await signIn(page, "student");
    await expect(page).toHaveURL(/\/student\//);
  });

  test("each role signs in through the form and lands on its own portal", async ({ browser }) => {
    test.setTimeout(240_000);
    const PORTALS: [AccountKey, RegExp][] = [
      ["student", /\/student\/dashboard$/],
      ["teacher", /\/teacher\/dashboard$/],
      ["coach", /\/mentor\/dashboard$/],
      ["headCoach", /\/mentor\/dashboard$/],
      ["admin", /\/admin\/dashboard$/],
      ["superAdmin", /\/admin\/dashboard$/],
    ];
    for (const [who, portal] of PORTALS) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signIn(page, who);
      await expect(page, who).toHaveURL(portal, { timeout: 30_000 });
      await context.close();
    }
  });

  test("an e-mail address signs in too (the backend accepts either)", async ({ page }) => {
    await signInWith(page, `${ACCOUNTS.teacher.username}@e2e.local`, passwordOf("teacher"));
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  });

  test("a wrong password for a real account: the same message as before; the right one then signs in", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="username"]').waitFor({ timeout: 90_000 });
    await page.locator('input[name="username"]').fill(ACCOUNTS.coach.username);
    await page.locator('input[name="password"]').fill("Wrong-Password-2026!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-form").getByRole("alert")).toHaveText("The username or password is not correct. Check them and try again.", { timeout: 30_000 });
    // The password is cleared, the username kept (as before).
    await expect(page.locator('input[name="password"]')).toHaveValue("");
    await expect(page.locator('input[name="username"]')).toHaveValue(ACCOUNTS.coach.username);
    await signIn(page, "coach");   // a correct password also clears the failure count
    await expect(page).toHaveURL(/\/mentor\/dashboard$/);
  });

  test("too many attempts for one username: the rate-limit message (the backend's real 429)", async ({ page, request }) => {
    // The backend allows 5 attempts a minute per username from anywhere (and locks one username + address after 5
    // wrong passwords, which answers like a wrong password). So 5 wrong attempts from 5 other addresses (straight to the
    // backend, as someone elsewhere would), then this browser's attempt is refused with 429. A throwaway username: no
    // real account is affected.
    const name = `limit.${Date.now().toString(36)}`;
    const api = process.env.E2E_API_URL ?? "http://127.0.0.1:4100";
    for (let i = 1; i <= 5; i++) {
      const r = await request.post(`${api}/api/v1/auth/login`, {
        data: { username: name, password: `Wrong-${i}-Password!` },
        headers: { "X-Forwarded-For": `10.77.0.${i}` },
      });
      expect(r.status(), `attempt ${i} from elsewhere`).toBe(401);
    }
    await page.goto("/login");
    const username = page.locator('input[name="username"]');
    await username.waitFor({ timeout: 90_000 });
    await username.fill(name);
    await page.locator('input[name="password"]').fill("Wrong-6-Password!");
    const answer = page.waitForResponse((r) => r.url().includes("/auth/login") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "Sign in" }).click();
    const res = await answer;
    expect(res.status()).toBe(429);
    // Plain words with the server's own wait (details.retryAfter, seconds; a sign-in lock can last up to an hour).
    const retryAfter = (await res.json()).details?.retryAfter as number | undefined;
    const wait = !retryAfter || retryAfter <= 60 ? "a minute" : retryAfter >= 3300 ? "about an hour" : `${Math.ceil(retryAfter / 60)} minutes`;
    await expect(page.getByTestId("login-form").getByRole("alert")).toHaveText(`Too many attempts in a short time. Wait ${wait}, then try again.`);
    await expect(page).toHaveURL(/\/login$/);
    expect(await fits(page), "with the rate-limit message").toEqual([]);
  });
});
