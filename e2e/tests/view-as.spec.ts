/**
 * "View as" (read only, owner 2026-11-23) in the browser:
 *  - an Administrator opens a student's page → View as this user → a new tab shows the student's dashboard with the
 *    banner; a reload keeps the view (sessionStorage of that tab);
 *  - trying to change something (Mark all as read) shows the backend's read-only sentence, and nothing changes in the
 *    database;
 *  - Return to my account ends the viewing session (closed in the database) and closes the tab;
 *  - the Administrator's original tab is still signed in as the Administrator;
 *  - a coach (no permission) sees no button.
 * One synthetic student and one notification are created per run (unique names).
 */
import { expect, test } from "@playwright/test";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const STUDENT = { username: `viewas.${RUN}`, first: `Viewed${RUN}` };
let studentId = "";
let notificationId = "";

test.describe("view as (read only)", () => {
  test.beforeAll(async () => {
    await withDb(async (c) => {
      const school = await createSchool(c, `View As School ${RUN}`);
      studentId = await createStudent(c, STUDENT.username, STUDENT.first, school, "VERIFIED");
      // An account that already gave its gender is not asked for it (the viewing tab shows the dashboard directly).
      await c.query(`UPDATE "User" SET gender = 'FEMALE' WHERE id = $1`, [studentId]);
      notificationId = (await c.query<{ id: string }>(
        `INSERT INTO "Notification" (id, "userId", category, type, title, body) VALUES (gen_random_uuid()::text, $1, 'ACCOUNT', 'general', $2, 'Unread on purpose') RETURNING id`,
        [studentId, `View-as notice ${RUN}`],
      )).rows[0].id;
    });
  });

  test("an Administrator views a student in a new tab, read only; returning ends the session; the admin tab stays signed in", async ({ page, context }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto(`/admin/users/${studentId}`);
    await page.getByTestId("view-as-open").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Opens a new tab where you see the platform exactly as ${STUDENT.first} E2E does. Nothing can be changed there. Your own session stays open in this tab.`);
    await dialog.locator("#view-as-reason").fill("Browser test: check the student's dashboard");
    const [tab] = await Promise.all([context.waitForEvent("page"), dialog.getByTestId("view-as-start").click()]);

    await tab.waitForURL(/\/student\/dashboard/, { timeout: 60_000 });
    const banner = tab.getByTestId("view-as-banner");
    await expect(banner).toContainText(`Viewing as ${STUDENT.first} E2E (Student) — read only.`, { timeout: 30_000 });
    // The ticket is gone from the address; the token is in this tab's sessionStorage only (never localStorage).
    expect(await tab.evaluate(() => Object.keys(window.localStorage).filter((k) => k.includes("view-as")))).toEqual([]);
    expect(await tab.evaluate(() => window.sessionStorage.getItem("rof-view-as") !== null)).toBe(true);

    // A reload keeps the view; a change is refused with the backend's plain sentence; nothing changes.
    await tab.goto("/student/notifications");
    await expect(tab.getByTestId("view-as-banner")).toBeVisible({ timeout: 30_000 });
    await expect(tab.getByText(`View-as notice ${RUN}`)).toBeVisible({ timeout: 30_000 });
    await tab.getByRole("button", { name: "Mark all as read" }).click();
    await expect(tab.getByText(`You are viewing the platform as ${STUDENT.first} E2E. Nothing can be changed in this view. Return to your own account to make changes.`)).toBeVisible({ timeout: 30_000 });
    expect(await withDb(async (c) => (await c.query(`SELECT "readAt" FROM "Notification" WHERE id = $1`, [notificationId])).rows[0].readAt)).toBeNull();

    // Return to my account: the viewing session ends on the server and the tab closes.
    const closed = tab.waitForEvent("close", { timeout: 30_000 });
    await tab.getByTestId("view-as-return").click();
    await closed;
    const session = await withDb(async (c) => (await c.query(
      `SELECT "endedReason", reason FROM "ViewAsSession" WHERE "targetId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [studentId])).rows[0]);
    expect(session).toEqual({ endedReason: "ENDED_BY_ACTOR", reason: "Browser test: check the student's dashboard" });

    // The Administrator's own tab is untouched: still signed in as the Administrator after a reload.
    await page.reload();
    await expect(page.getByTestId("view-as-open")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("view-as-banner")).toHaveCount(0);
    const adminId = await withDb((c) => idOf(c, "admin"));
    expect(await withDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'VIEW_AS_STARTED' AND "actorId" = $1`, [adminId])).rows[0].n)).toBeGreaterThan(0);
  });

  test("the viewing tab shows a plain page once the session has ended", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto(`/admin/users/${studentId}`);
    await page.getByTestId("view-as-open").click();
    const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("dialog").getByTestId("view-as-start").click()]);
    await expect(tab.getByTestId("view-as-banner")).toBeVisible({ timeout: 60_000 });
    // The session is ended elsewhere (as when the permission is removed): the next request answers VIEW_AS_ENDED.
    await withDb((c) => c.query(`UPDATE "ViewAsSession" SET "endedAt" = now(), "endedReason" = 'PERMISSION_REMOVED' WHERE "targetId" = $1 AND "endedAt" IS NULL`, [studentId]));
    await tab.goto("/student/notifications");
    await expect(tab.getByTestId("view-as-message")).toContainText("This viewing session has ended (it lasts 30 minutes, or your permission changed). Close this tab.", { timeout: 30_000 });
    expect(await tab.evaluate(() => window.sessionStorage.getItem("rof-view-as"))).toBeNull();
    await page.reload();
    await expect(page.getByTestId("view-as-open")).toBeVisible({ timeout: 30_000 });
  });

  test("a coach (no permission) sees no View as button", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "coach");
    await page.goto(`/admin/users/${studentId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("view-as-open")).toHaveCount(0);
  });
});
