/**
 * Student lists on a phone (owner 2026-11-27): the page itself never scrolls sideways; the wider table scrolls inside its
 * card, and the Username column can be reached by scrolling it. Coach, Teacher and Administrator lists.
 */
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";
import { createStudentListFixture, endStudentListFixture, type StudentListFixture } from "../support/student-lists";

let f: StudentListFixture;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { f = await createStudentListFixture("m", 3); });
test.afterAll(async () => { await endStudentListFixture(f); });

async function checkPhoneList(page: Page) {
  await page.getByLabel("Search students").fill(f.run);
  const table = page.locator("table").filter({ has: page.getByTestId("student-cell") });
  await expect(table.getByTestId("student-cell")).toHaveCount(3);
  // The page: nothing sideways.
  const page_ = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.view + 1);
  // The table: scrolls inside its card, and the username can be scrolled into view.
  const username = table.getByTestId("student-username").first();
  await username.scrollIntoViewIfNeeded();
  await expect(username).toBeInViewport();
  await expect(username).toHaveText(/^e2e\.sl\./);
  await expect(table.getByTestId("avatar-badge").first()).toBeVisible();
}

test("Coach's Students on a phone", async ({ page }) => {
  await signInWith(page, f.coachUser, PASSWORD);
  await page.goto("/mentor/students");
  await checkPhoneList(page);
});

test("Teacher's My students on a phone", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/dashboard");
  await checkPhoneList(page);
});

test("Administrators' Students on a phone", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await checkPhoneList(page);
});
