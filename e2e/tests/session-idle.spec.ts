/**
 * Signed out after 60 minutes without activity, warned at 55 (owner, 2026-11-28) — in the browser with a controlled
 * clock (Playwright clock), against the real backend:
 *   - the warning shows the owner's text at 55 minutes; "Continue working" resets the 60 minutes;
 *   - with no answer the session ends at 60: the server session is revoked, the sign-in page says why, and reloading
 *     never restores it;
 *   - background requests (notification polling, capability checks) during the hour do not keep the session alive;
 *   - activity in one tab keeps the other tab signed in; the sign-out reaches every tab.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";
import { ACCOUNTS } from "../support/accounts";
import { newestSession, sessionLive } from "../support/db";

const WARNING_TEXT = "Your session will expire in 5 minutes due to inactivity. Would you like to continue working?";
const SIGNED_OUT_TEXT = "You were signed out after 60 minutes without activity. Sign in again to continue.";

test.describe("Session inactivity", () => {
  test("warning at 55 minutes with the owner's text; Continue resets the hour", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await signIn(page, "student");
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await page.clock.fastForward("54:30");
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await page.clock.fastForward("00:31");
    await expect(page.getByTestId("idle-warning")).toBeVisible();
    await expect(page.getByTestId("idle-warning-text")).toHaveText(WARNING_TEXT);
    await expect(page.getByTestId("idle-warning-countdown")).toContainText(/Signing out in [45]:\d\d/);
    // A mouse passing over the page does not answer the question.
    await page.mouse.move(200, 200);
    await page.mouse.move(400, 300);
    await expect(page.getByTestId("idle-warning")).toBeVisible();
    await page.getByTestId("idle-continue").click();
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    // A full hour again from the answer: no warning at 54 minutes after it, signed in at 59.
    await page.clock.fastForward("54:00");
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await page.clock.fastForward("05:00");
    await expect(page).toHaveURL(/\/student\//);
  });

  test("no answer: signed out at 60 minutes — the server session is revoked, the sign-in page says why, a reload does not restore it; background requests did not count", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await signIn(page, "student");
    const session = await newestSession(ACCOUNTS.student.username);
    expect(await sessionLive(session)).toBe(true);
    const background: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/v1/") && !r.url().includes("/auth/")) background.push(r.url()); });
    await page.clock.fastForward("59:00");
    await expect(page).toHaveURL(/\/student\//);
    await page.clock.fastForward("01:00");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(SIGNED_OUT_TEXT)).toBeVisible();
    expect(background.length, "background requests happened during the hour (polling) and did not keep the session").toBeGreaterThan(0);
    await expect.poll(() => sessionLive(session)).toBe(false);   // the server session is revoked
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("tabs share the clock: activity in one tab keeps the other signed in; the sign-out reaches both", async ({ page, context }) => {
    test.setTimeout(180_000);
    // One fake clock for the whole browser (every tab sees the same time, as in a real browser).
    await context.clock.install({ time: new Date("2027-03-01T08:00:00Z") });
    await signIn(page, "student");
    const other = await context.newPage();
    await other.goto("/student/dashboard");
    await expect(other.getByTestId("rof-logo-link").first()).toBeVisible();

    // 50 minutes later the person works in the second tab (a click, typing).
    await context.clock.fastForward("50:00");
    await other.mouse.click(5, 300);
    await other.keyboard.press("Shift");
    // 15 minutes later: 65 minutes since the first tab was used, 15 since the second — nobody is signed out or warned.
    await context.clock.fastForward("15:00");
    await expect(page).toHaveURL(/\/student\//);
    await expect(page.getByTestId("idle-warning")).toHaveCount(0);
    await expect(other).toHaveURL(/\/student\//);
    // 46 more minutes without activity anywhere: 61 since the last activity — both tabs are signed out.
    await context.clock.fastForward("46:00");
    await expect(other).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
    await other.close();
  });
});
