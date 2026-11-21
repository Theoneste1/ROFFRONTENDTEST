/**
 * Teacher–student access (owner approvals TS-1…TS-6), in a real browser against the real backend and PostgreSQL:
 *  1. the Administrator opens the school's "Teacher & student access" page from the school page;
 *  2. selects a verified student and assigns them to the school's teacher (confirmation summary, then results);
 *  3. selects another verified student and gives the teacher "View student profiles" for that student only;
 *  4. the teacher's My Students shows how each student is seen and what the teacher may do, and the number of
 *     pending students — never their names; the selected student opens, the other does not.
 * Fixtures (fresh per run, synthetic): a school, the e2e Teacher assigned to it, two verified students, one pending.
 * One sign-in per role (the backend allows 10 sign-ins a minute per address).
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "../support/db";

const run = Date.now().toString(36);
const names = { school: `E2E Access School ${run}`, s1: `Ada${run}`, s2: `Ben${run}`, pending: `Cleo${run}` };
let schoolId: string;

test.beforeAll(async () => {
  await withDb(async (c) => {
    schoolId = await createSchool(c, names.school);
    await assignTeacherSchool(c, await idOf(c, "e2e.teacher"), schoolId);
    await createStudent(c, `e2e.tsa.a.${run}`, names.s1, schoolId, "VERIFIED");
    await createStudent(c, `e2e.tsa.b.${run}`, names.s2, schoolId, "VERIFIED");
    await createStudent(c, `e2e.tsa.c.${run}`, names.pending, schoolId, "PENDING");
  });
});

test.describe.serial("Administrator: School Access", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  const row = (name: string) => page.getByTestId("access-students").locator("tr", { hasText: name });
  const chooseTeacher = async () => {
    const select = page.getByTestId("access-action-form").getByLabel("Teacher", { exact: true });
    const value = await select.locator("option", { hasText: "@e2e.teacher" }).getAttribute("value");
    await select.selectOption(value!);
  };

  test("the school page links to the access page; counts and the school's teacher are shown", async () => {
    await page.goto(`/admin/schools/${schoolId}`);
    await page.getByTestId("school-access-link").click();
    await expect(page).toHaveURL(new RegExp(`/admin/schools/${schoolId}/access$`));
    // Each count is the value under its own label (this run's fresh school: 2 verified, 1 pending, none assigned).
    const count = (label: string) =>
      page.getByTestId("access-counts").getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
    await expect(count("Verified students")).toHaveText("2");
    await expect(count("Pending verification")).toHaveText("1");
    await expect(count("Verified, no teacher")).toHaveText("2");
    await expect(page.getByTestId("access-teachers")).toContainText("@e2e.teacher");
    await expect(row(names.pending)).toContainText("Pending");
  });

  test("assign a selected student to the teacher: summary first, then per-student results", async () => {
    await row(names.s1).getByRole("checkbox").check();
    await expect(page.getByTestId("selection-bar")).toContainText("1 selected");
    await page.getByRole("button", { name: "Assign to a teacher" }).click();
    const form = page.getByTestId("access-action-form");
    await chooseTeacher();
    await form.getByRole("button", { name: "Review" }).click();
    const confirm = page.getByTestId("access-action-confirm");
    await expect(confirm).toContainText("Assign 1 student");
    await expect(confirm).toContainText("students are not notified");
    await page.getByTestId("access-action-run").click();
    await expect(page.getByTestId("action-results")).toContainText("1 assigned");
    await expect(row(names.s1)).toContainText("Teacher");   // the teacher's name is listed on the row
    await expect(page.getByTestId("selection-bar")).toHaveCount(0);
  });

  test("give the teacher a permission for one selected student only", async () => {
    await row(names.s2).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Give a permission" }).click();
    const form = page.getByTestId("access-action-form");
    await chooseTeacher();
    await form.getByLabel("Permission").selectOption("students.viewProfile");
    await form.getByLabel("Reason").fill("Mentoring this student");
    await form.getByRole("button", { name: "Review" }).click();
    await expect(page.getByTestId("access-action-confirm")).toContainText("1 selected student");
    await page.getByTestId("access-action-run").click();
    await expect(page.getByTestId("action-results")).toContainText("1 added");
    await expect(page.getByTestId("access-teachers")).toContainText("Only selected students");
  });
});

test.describe.serial("Teacher: My Students", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "teacher");
  });
  test.afterAll(async () => page.close());

  const row = (name: string) => page.getByTestId("teacher-student-row").filter({ hasText: name });

  test("how each student is seen, what the teacher may do, and pending students only as a number", async () => {
    await page.goto("/teacher/dashboard");
    await expect(page.getByTestId("pending-students")).toContainText("waiting for an administrator to verify");
    await expect(page.getByTestId("teacher-students")).not.toContainText(names.pending);
    await expect(row(names.s1)).toContainText("Assigned to you");
    await expect(row(names.s1)).toContainText("School");
    await expect(row(names.s1)).toContainText("No access");
    await expect(row(names.s2)).toContainText("Profile");
    await row(names.s2).getByRole("link", { name: /Open/ }).click();
    await expect(page).toHaveURL(/\/teacher\/students\//);
    await expect(page.getByText(names.s2).first()).toBeVisible();
  });
});
