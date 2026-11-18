import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, passwordOf, type AccountKey } from "./accounts";

/** The login form's text for a 429 (lib/api/errors.ts errorMessage). */
const RATE_LIMITED = /Too many requests/i;
/** The backend allows 10 sign-ins per minute per address: after a 429, wait for the window to pass. */
const RATE_WINDOW_MS = 61_000;
const MAX_ATTEMPTS = 3;
const notLogin = (url: URL) => !/\/login\/?$/.test(url.pathname);

/**
 * Signs in through the real login form and waits for the role's portal. A full run signs in more than 10 times a
 * minute, which the backend's credential limit refuses (429): the form then says so, and this waits until the limit
 * frees and submits again (at most {@link MAX_ATTEMPTS} times; the wait is added to the test's timeout). Any other
 * refusal fails at once.
 */
export async function signIn(page: Page, who: AccountKey) {
  await signInWith(page, ACCOUNTS[who].username, passwordOf(who));
}

/** {@link signIn} with any credentials (e.g. an account created by the spec itself). */
export async function signInWith(page: Page, username: string, password: string) {
  for (let attempt = 1; ; attempt++) {
    await page.goto("/login");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    const limited = page.getByRole("alert").filter({ hasText: RATE_LIMITED });
    const outcome = await Promise.race([
      page.waitForURL(notLogin, { timeout: 30_000 }).then(() => "in" as const, () => null),
      limited.waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome === "limited" && attempt < MAX_ATTEMPTS) {
      test.info().annotations.push({ type: "rate-limit", description: `sign-in as ${username} got 429; waited ${RATE_WINDOW_MS / 1000} s` });
      test.info().setTimeout(test.info().timeout + RATE_WINDOW_MS + 5_000);
      await page.waitForTimeout(RATE_WINDOW_MS);
      continue;
    }
    break;
  }
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

/**
 * The hrefs of the sidebar's direct items and of the "More" panel. With `openGroups`, every closed group in the
 * sidebar (e.g. the student's Assignments) is opened first and its sub-links are returned in `children` (a group is a
 * plain <div> directly in the nav holding its toggle and, when open, its links; "More" is the div with a test id).
 */
export async function sidebarHrefs(page: Page, { openGroups = false }: { openGroups?: boolean } = {}) {
  const nav = page.getByTestId("sidebar-nav").first();
  await nav.locator("a[href], button").first().waitFor();
  const groups = nav.locator(":scope > div:not([data-testid])");
  if (openGroups) {
    const closed = groups.locator(':scope > button[aria-expanded="false"]');
    while ((await closed.count()) > 0) await closed.first().click();
  }
  const direct = await nav.locator(":scope > a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  const children = await groups.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  const more = await nav.locator('[data-testid="sidebar-more-panel"] a[href]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  return { direct, more, children, all: [...direct, ...more] };
}
