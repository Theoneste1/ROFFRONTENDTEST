/**
 * The ROF logo always opens the ROF LMS home page (owner, 2026-11-20), never the foundation's website: on the public
 * home page, in every portal's top bar, and on the pages outside the portals (the public card).
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test("the logo opens the LMS home page: home page, a portal, a public page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const homeLogo = page.getByTestId("rof-logo-link").first();
  await expect(homeLogo).toHaveAttribute("href", "/");
  // A page outside the portals (the public card: here the page-not-found page).
  await page.goto("/no-such-page-for-the-logo-test");
  await expect(page.getByTestId("rof-logo-link").first()).toHaveAttribute("href", "/");

  await signIn(page, "student");
  const portalLogo = page.getByTestId("rof-logo-link").first();
  await expect(portalLogo).toHaveAttribute("href", "/");
  await portalLogo.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/rwandaolympiadfoundation\.org/);
});
