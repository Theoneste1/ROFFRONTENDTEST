/**
 * Error messages on screen (QA 2026-11-24): what a person actually SEES when something goes wrong — not only that the
 * request is refused. Real backend and frontend; failures of the network and the server are simulated in the browser
 * (page.route) so they can be produced on demand:
 *  - sign-in: wrong password, no connection, the server restarting (a proxy's HTML page), an unexpected server error
 *    (with the reference to quote), too many attempts (how long to wait);
 *  - links: an invalid activation link, an invalid password-reset link;
 *  - permissions and missing records: a student opening an Administrator page, an unknown or malformed account id;
 *  - a list that fails to load says so and can be retried; the typed e-mail survives a failed request;
 *  - an Administrator creating an account with a username another account uses is told which field.
 * Never shown: raw status codes, "Internal Server Error", stack traces or SQL.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";

const TECHNICAL = /\b(4\d\d|5\d\d) (Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error)\b|Internal Server Error|status code|stack|at \w+ \(|SELECT |prisma|ECONNREFUSED|undefined|\[object Object\]/i;

async function expectNoTechnicalText(page: Page) {
  const text = await page.locator("main, body").first().innerText();
  expect(text, "no technical error text on screen").not.toMatch(TECHNICAL);
}

async function submitSignIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  const user = page.locator('input[name="username"]');
  await user.waitFor({ timeout: 90_000 });
  await user.fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

const loginAlert = (page: Page) => page.getByTestId("login-form").getByRole("alert");

test.describe("error messages: signing in", () => {
  test("wrong password: says it is not correct and what to do; the username stays typed", async ({ page }) => {
    await submitSignIn(page, "e2e.student", "Not-The-Password-1!");
    await expect(loginAlert(page)).toContainText("Wrong username or password. Check them and try again.", { timeout: 30_000 });
    await expect(page.locator('input[name="username"]')).toHaveValue("e2e.student");
    await expectNoTechnicalText(page);
  });

  test("no connection: says the server cannot be reached and to check the connection; the button works again", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (r) => r.abort("internetdisconnected"));
    await submitSignIn(page, "e2e.student", "whatever-1!");
    await expect(loginAlert(page)).toHaveText("Cannot reach the server. Check your internet connection, then try again.", { timeout: 30_000 });
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
    await expectNoTechnicalText(page);
  });

  test("the server restarting (a proxy's HTML 502 page): says to wait a minute and try again", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (r) => r.fulfill({ status: 502, contentType: "text/html", body: "<html><body><h1>502 Bad Gateway</h1></body></html>" }));
    await submitSignIn(page, "e2e.student", "whatever-1!");
    await expect(loginAlert(page)).toContainText("The server isn't responding right now (it may be restarting). Wait a minute, then try again.", { timeout: 30_000 });
    await expectNoTechnicalText(page);
  });

  test("an unexpected server error: plain words and the reference to quote, never the server's own text", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (r) => r.fulfill({
      status: 500, contentType: "application/json",
      body: JSON.stringify({ statusCode: 500, error: "Internal Server Error", code: "INTERNAL_ERROR", message: "Internal server error", requestId: "qa-ref-123" }),
    }));
    await submitSignIn(page, "e2e.student", "whatever-1!");
    await expect(loginAlert(page)).toContainText("Something went wrong on our side", { timeout: 30_000 });
    await expect(loginAlert(page)).toContainText("qa-ref-123");
    await expectNoTechnicalText(page);
  });

  test("too many attempts: says how long to wait", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (r) => r.fulfill({
      status: 429, contentType: "application/json", headers: { "retry-after": "300" },
      body: JSON.stringify({ statusCode: 429, code: "TOO_MANY_REQUESTS", message: "Too Many Requests", details: { retryAfter: 300 } }),
    }));
    await submitSignIn(page, "e2e.student", "whatever-1!");
    await expect(loginAlert(page)).toContainText(/Wait 5 minutes, then try again/, { timeout: 30_000 });
    await expectNoTechnicalText(page);
  });
});

test.describe("error messages: links", () => {
  test("an invalid activation link says so and offers a new link", async ({ page }) => {
    await page.goto("/activate?token=not-a-real-token-0000000000000000");
    await expect(page.getByText(/This activation link is invalid, has already been used, or has expired/)).toBeVisible({ timeout: 60_000 });
    await expectNoTechnicalText(page);
  });

  test("an invalid password-reset link says so and how to get a new one", async ({ page }) => {
    await page.goto("/reset-password?token=not-a-real-token-0000000000000000");
    const pw = page.locator('input[type="password"]');
    await pw.first().waitFor({ timeout: 60_000 });
    for (const f of await pw.all()) await f.fill("A-New-Passw0rd-2026!");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("This reset link is invalid or has expired.", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
    await expectNoTechnicalText(page);
  });

  test("forgot password with no connection: plain message, the typed e-mail is kept", async ({ page }) => {
    await page.goto("/forgot-password");
    const email = page.locator('input[type="email"], input[name="email"]').first();
    await email.waitFor({ timeout: 60_000 });
    await email.fill("someone@example.com");
    await page.route("**/api/v1/auth/**", (r) => r.abort("internetdisconnected"));
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Cannot reach the server. Check your internet connection, then try again.")).toBeVisible({ timeout: 30_000 });
    await expect(email).toHaveValue("someone@example.com");
  });
});

test.describe("error messages: permissions and missing records", () => {
  test("a student opening an Administrator page sees no administrator data and is told or sent elsewhere", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    // Either sent back to their own portal, or told plainly they have no access — never the admin list: no "Users"
    // heading, no other account's username. (Their own dashboard may hold tables of its own, e.g. the calendar.)
    const url = page.url();
    if (/\/admin\//.test(url)) await expect(page.getByText(/(don't|do not) have (access|permission)/i).first()).toBeVisible({ timeout: 30_000 });
    else expect(new URL(url).pathname).toMatch(/^\/student(\/|$)/);
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toHaveCount(0);
    await expect(page.getByText("e2e.teacher")).toHaveCount(0);
    await expect(page.getByText("e2e.coach")).toHaveCount(0);
    await expectNoTechnicalText(page);
  });

  test("an Administrator opening an account that does not exist is told it was not found", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/users/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText(/not found|doesn't exist|does not exist|no longer exists/i).first()).toBeVisible({ timeout: 30_000 });
    await expectNoTechnicalText(page);
  });

  test("a malformed account address (not an id) gets a plain message, not a validation rule", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/users/not-an-id");
    await expect(page.getByText(/not found|doesn't exist|does not exist|link is wrong|isn't valid|is not valid/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/uuid/i)).toHaveCount(0);
    await expectNoTechnicalText(page);
  });

  test("a list that fails to load says so plainly and loads again on retry", async ({ page }) => {
    await signIn(page, "admin");
    let fail = true;
    await page.route("**/api/v1/admin/users?**", (r) => fail
      ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ statusCode: 500, code: "INTERNAL_ERROR", message: "Internal server error", requestId: "qa-list-1" }) })
      : r.fallback());
    await page.goto("/admin/users");
    await expect(page.getByText(/Something went wrong on our side/).first()).toBeVisible({ timeout: 60_000 });
    await expectNoTechnicalText(page);
    fail = false;
    await page.getByRole("button", { name: /try again|retry/i }).first().click();
    await expect(page.getByText("e2e.student").first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("error messages: account management", () => {
  test("an Administrator creating an account with a username another account uses sees it next to the username", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Add user" }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("First name").fill("Dup");
    await form.getByLabel("Last name").fill("Name");
    await form.getByLabel("E-mail").fill(`dup.name.${Date.now()}@example.com`);
    await form.getByLabel("Username").fill("e2e.student");
    await form.locator('input[type="password"]').first().fill("Str0ng!Passw0rd-2026");
    await form.getByLabel("Role").selectOption("MENTOR");
    const gender = form.getByLabel("Gender");
    if (await gender.count()) await gender.selectOption({ index: 1 });
    await form.getByRole("button", { name: /create|add|save/i }).last().click();
    await expect(form.getByText("This username is already used by another account. Choose a different username.")).toBeVisible({ timeout: 30_000 });
    await expect(form.getByLabel("Username")).toHaveValue("e2e.student");
    await expectNoTechnicalText(page);
  });
});
