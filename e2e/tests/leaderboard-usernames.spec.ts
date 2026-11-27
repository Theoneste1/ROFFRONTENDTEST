/** Owner 2026-11-27: on the leaderboard students see each student's username, never their names (staff still see names). */
import { expect, test } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

test("student: every leaderboard row shows a username, never a name", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/student/leaderboard");
  // The podium and the table (a small division may be all podium).
  const board = page.getByRole("main");
  await expect(board.getByText("(You)")).toBeVisible();
  const shown = await board.innerText();
  const students = await withDb(async (c) => (await c.query<{ username: string; firstName: string; lastName: string }>(
    `SELECT u.username, u."firstName", u."lastName" FROM "User" u
       WHERE u.role = 'STUDENT' AND u."divisionId" = (SELECT "divisionId" FROM "User" WHERE username = 'e2e.student')`)).rows);
  expect(students.length).toBeGreaterThan(0);
  expect(students.some((s) => shown.includes(s.username))).toBe(true);
  for (const s of students) expect(shown).not.toContain(`${s.firstName} ${s.lastName.charAt(0)}.`);
});
