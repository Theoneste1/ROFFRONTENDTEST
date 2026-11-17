import { expect, type Page } from "@playwright/test";
import { ACCOUNTS, passwordOf, type AccountKey } from "./accounts";

/** Signs in through the real login form and waits for the role's portal. */
export async function signIn(page: Page, who: AccountKey) {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(ACCOUNTS[who].username);
  await page.locator('input[name="password"]').fill(passwordOf(who));
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

/** The hrefs of the sidebar's direct items and of the "More" panel. */
export async function sidebarHrefs(page: Page) {
  const nav = page.getByTestId("sidebar-nav").first();
  await nav.locator("a[href], button").first().waitFor();
  const direct = await nav.locator(":scope > a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  const more = await nav.locator('[data-testid="sidebar-more-panel"] a[href]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  return { direct, more, all: [...direct, ...more] };
}
