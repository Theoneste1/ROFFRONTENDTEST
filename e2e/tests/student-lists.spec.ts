/**
 * Student lists with pictures and a Username column (owner 2026-11-27), for the three portals that list students:
 * the Coach's Students, the Teacher's My students and the Administrators' Students.
 *  - The student with a picture shows it beside the name; a student without one shows their initials.
 *  - The username is in its own "Username" column, not beside the name.
 *  - Search and pagination still work (22 students: two pages of 20 for the Teacher and the Administrators).
 *  - The Administrators' list shows the current year's students (the fixture enrols them).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";
import { createStudentListFixture, endStudentListFixture, type StudentListFixture } from "../support/student-lists";

let f: StudentListFixture;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { f = await createStudentListFixture("d", 22); });
test.afterAll(async () => { await endStudentListFixture(f); });

/** The table body's rows, once loaded. */
const rows = (page: Page) => page.locator("tbody tr").filter({ has: page.getByTestId("student-cell") });

async function search(page: Page, term: string) {
  await page.getByLabel("Search students").fill(term);
}

/** The pictured student and an unpictured one: the picture vs the initials, the username in its own cell. */
async function checkCells(page: Page) {
  const pictured = f.students[0];
  const plain = f.students[1];
  await search(page, pictured.username);
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  await expect(row.getByTestId("avatar-badge")).toHaveAttribute("data-avatar", "picture");
  await expect(row.getByTestId("avatar-badge").locator("img")).toHaveCount(1);
  await expect(row.getByTestId("student-cell")).toContainText(pictured.firstName);
  await expect(row.getByTestId("student-cell")).not.toContainText(pictured.username);
  await expect(row.getByTestId("student-username")).toHaveText(pictured.username);
  await search(page, plain.username);
  await expect(rows(page)).toHaveCount(1);
  const other = rows(page).first();
  await expect(other.getByTestId("avatar-badge")).toHaveAttribute("data-avatar", "generated");
  await expect(other.getByTestId("avatar-badge")).toHaveText(/^[A-Z]{1,2}$/);
  await expect(other.getByTestId("student-username")).toHaveText(plain.username);
}

async function everyRowHasPictureAndUsername(list: Locator) {
  const n = await list.count();
  for (let i = 0; i < n; i++) {
    const r = list.nth(i);
    await expect(r.getByTestId("avatar-badge")).toBeVisible();
    await expect(r.getByTestId("student-username")).toHaveText(/^e2e\.sl\./);
  }
}

test("Coach: picture or initials beside the name, Username column, search narrows the list", async ({ page }) => {
  await signInWith(page, f.coachUser, PASSWORD);
  await page.goto("/mentor/students");
  await expect(page.getByRole("columnheader", { name: "Username" })).toBeVisible();
  await search(page, f.run);
  await expect(rows(page)).toHaveCount(22);   // 25 a page for coaches: one page
  await everyRowHasPictureAndUsername(rows(page));
  await checkCells(page);
});

test("Teacher: picture or initials, Username column, search and two pages of 20", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/dashboard");
  await expect(page.getByRole("columnheader", { name: "Username" })).toBeVisible();
  await search(page, f.run);
  await expect(rows(page)).toHaveCount(20);
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(pager).toContainText("Page 1 of 2");
  // The search has applied (it is debounced): paging before it would be reset to page 1 when it lands.
  await expect(pager).toContainText("22 total");
  await everyRowHasPictureAndUsername(rows(page));
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(pager).toContainText("Page 2 of 2");
  await expect(rows(page)).toHaveCount(2);
  await everyRowHasPictureAndUsername(rows(page));
  await checkCells(page);
});

test("Administrators: the current year's students, picture or initials, Username column, search and two pages", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/students");
  await expect(page.getByRole("columnheader", { name: "Username" })).toBeVisible();
  await search(page, f.run);
  await expect(rows(page)).toHaveCount(20);
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(pager).toContainText("Page 1 of 2");
  await expect(pager).toContainText("22 total");
  await everyRowHasPictureAndUsername(rows(page));
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(rows(page)).toHaveCount(2);
  await checkCells(page);
  // "Last sign-in" stays under the name; the username is no longer there.
  await expect(rows(page).first().getByTestId("student-cell")).toContainText("Last sign-in never");
});
