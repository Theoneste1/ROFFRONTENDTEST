/**
 * Independent review 2026-11-28 — cross-feature integration of FE #104-#110 with BE #121-#126 (combined branches):
 *  1. #108 logo sign-out × #110 refreshed profile × #109 privacy: after a Super Administrator signs out with the logo,
 *     the next person signing in on the same browser sees only their own identity — before and after a reload (the
 *     reload restores the session through the refresh that now carries the profile).
 *  2. #108 inactivity × #110: a page reload is not activity — the shared hour keeps running through it (the browser's
 *     clock and the server's refresh both leave it alone).
 *  3. #108 × #107: the in-system user guide is a portal page like any other — the inactivity warning appears there too,
 *     and "Continue working" keeps the reader signed in.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";
import { ACCOUNTS } from "../support/accounts";

test.describe("Review 2026-11-28: cross-feature integration", () => {
  test("logo sign-out of a Super Administrator, then a student signs in: only the student's identity, also after a reload", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "superAdmin");
    const saName = (await page.getByTestId("profile-menu-name").innerText()).trim();
    expect(saName.length).toBeGreaterThan(0);
    await page.getByTestId("rof-logo-link").first().click();
    await expect(page).toHaveURL(/\/$/);

    await signIn(page, "student");
    await expect(page).toHaveURL(/\/student\//);
    const studentName = (await page.getByTestId("profile-menu-name").innerText()).trim();
    expect(studentName).not.toBe(saName);
    const leaks = async () => {
      const text = await page.locator("body").innerText();
      return [saName, ACCOUNTS.superAdmin.username, "Super Admin"].filter((s) => text.includes(s));
    };
    expect(await leaks()).toEqual([]);
    // A reload restores the session through the refresh that carries the profile (#110 / BE #126).
    const refreshes: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/v1/auth/refresh")) refreshes.push(r.url()); });
    await page.reload();
    await expect(page.getByTestId("profile-menu-name")).toHaveText(studentName);
    expect(refreshes.length).toBeGreaterThan(0);
    expect(await leaks()).toEqual([]);
  });

  test("a reload is not activity: the hour keeps running through it", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await signIn(page, "student");
    await page.clock.fastForward("50:00");
    await page.reload();
    await expect(page).toHaveURL(/\/student\//);
    // The session is restored (its refresh answered) before the clock jumps: a jump while the refresh is in flight would
    // fire the client's 30-second refresh timeout — a fake-clock artefact, not the behaviour under test.
    await expect(page.getByTestId("profile-menu-name")).toBeVisible();
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await page.clock.fastForward("05:30");                 // 55½ minutes after the last activity — the reload did not reset it
    await expect(page.getByTestId("idle-warning")).toBeVisible();
  });

  test("the in-system user guide: the inactivity warning shows there too; Continue keeps the reader signed in", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await signIn(page, "coach");
    await page.getByTestId("profile-menu-button").click();
    await page.getByRole("menuitem", { name: "User guide" }).click();
    await expect(page).toHaveURL(/\/mentor\/guide/);
    await page.clock.fastForward("55:01");
    await expect(page.getByTestId("idle-warning")).toBeVisible();
    await page.getByTestId("idle-continue").click();
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await page.clock.fastForward("10:00");
    await expect(page).toHaveURL(/\/mentor\/guide/);
    await expect(page.getByTestId("user-guide-title")).toBeVisible();
  });
});
