/**
 * Clicking the ROF logo signs a signed-in person out (owner, 2026-11-28) — for every role: the normal secure sign-out
 * (the server session is revoked, not just the page's token), every other tab signed out too, then the public home
 * page. A double click signs out once; afterwards the portal asks for a sign-in again and the old session cannot be
 * restored from the cookie.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";
import { ACCOUNTS, type AccountKey } from "../support/accounts";
import { newestSession, sessionLive } from "../support/db";

const ROLES: Array<{ who: AccountKey; portal: string }> = [
  { who: "student", portal: "/student/dashboard" },
  { who: "teacher", portal: "/teacher/dashboard" },
  { who: "coach", portal: "/mentor/dashboard" },
  { who: "headCoach", portal: "/mentor/dashboard" },
  { who: "admin", portal: "/admin/dashboard" },
  { who: "superAdmin", portal: "/admin/dashboard" },
];

test.describe("The ROF logo signs out", () => {
  for (const { who, portal } of ROLES) {
    test(`${who}: the logo ends the session on the server, signs out every tab, then opens the home page`, async ({ page, context }) => {
      test.setTimeout(120_000);
      const username = ACCOUNTS[who].username;
      await signIn(page, who);
      await expect(page).toHaveURL(new RegExp(portal.replace(/\//g, "\\/")));
      const session = await newestSession(username);
      expect(await sessionLive(session)).toBe(true);
      const other = await context.newPage();
      await other.goto(portal);
      await expect(other.getByTestId("rof-logo-link").first()).toHaveAttribute("data-signs-out", "true");

      const logouts: string[] = [];
      page.on("request", (r) => { if (r.url().includes("/api/v1/auth/logout")) logouts.push(r.method()); });
      const logo = page.getByTestId("rof-logo-link").first();
      await expect(logo).toHaveAttribute("data-signs-out", "true");
      await logo.dblclick();                                   // a double click signs out once

      await expect(page).toHaveURL(/\/$/);                     // the public home page
      await expect(page.getByRole("link", { name: /log ?in|sign in/i }).first()).toBeVisible();
      expect(logouts).toEqual(["POST"]);
      // The server session is gone (every session of this browser revoked; the database is the evidence).
      await expect.poll(() => sessionLive(session)).toBe(false);
      // The other tab is signed out too.
      await expect(other).toHaveURL(/\/login/);
      // Back to the portal: a sign-in is needed; nothing restores the old session from the cookie.
      await page.goto(portal);
      await expect(page).toHaveURL(/\/login/);
      await other.close();
    });
  }

  test("signed out, the logo is a plain link to the home page", async ({ page }) => {
    await page.goto("/login");
    const brand = page.getByTestId("auth-brand-home").first();
    await expect(brand).toHaveAttribute("href", "/");
    await expect(brand).not.toHaveAttribute("data-signs-out", "true");
    await brand.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("on a page outside the portal (support) the brand mark signs a signed-in person out too", async ({ page }) => {
    await signIn(page, "student");
    const session = await newestSession(ACCOUNTS.student.username);
    expect(await sessionLive(session)).toBe(true);
    await page.goto("/support");
    const brand = page.getByTestId("auth-brand-home").first();
    await expect(brand).toHaveAttribute("data-signs-out", "true");
    await brand.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /log ?in|sign in/i }).first()).toBeVisible();
    await expect.poll(() => sessionLive(session)).toBe(false);
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
