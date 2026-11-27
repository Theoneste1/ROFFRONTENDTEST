/**
 * Teacher Portal navigation (owner 2026-11-27): My students is about students only; everything about tests is on Tests.
 *  - My students: no test overview, no test wording; the student list itself is unchanged.
 *  - Tests: the overview (open now, extensions, published results) at the top, above the list of tests, without an
 *    "All tests" link to the page it is already on; the list, its filters and the Students links still work.
 *  - The Help panel of Tests describes the overview.
 * Test workflows themselves (submission, extensions, results) are covered by test-submissions and test-results.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test.describe.configure({ mode: "serial" });

test("My students shows students only: no test overview, no test wording", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/dashboard");
  await expect(page.getByRole("heading", { name: "My students", level: 1 })).toBeVisible();
  await expect(page.getByTestId("teacher-students")).toBeVisible();
  await expect(page.getByLabel("Search students")).toBeVisible();
  await expect(page.getByTestId("tests-widget-teacher")).toHaveCount(0);
  const main = page.locator("main");
  for (const text of ["Open now", "Extensions", "Published results", "All tests", "Submit their tests"]) {
    await expect(main).not.toContainText(text);
  }
  // The Tests tab is still in the navigation.
  await expect(page.getByTestId("sidebar-nav").first().locator('a[href="/teacher/tests"]')).toHaveCount(1);
});

test("Tests: the overview at the top, above the tests; no link to itself; list and filters work", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/tests");
  await expect(page.getByRole("heading", { name: "Tests", level: 1 })).toBeVisible();
  const overview = page.getByTestId("tests-widget-teacher");
  await expect(overview).toBeVisible();
  for (const text of ["Open now", "Extensions", "Published results"]) await expect(overview).toContainText(text);
  await expect(overview.getByRole("link", { name: "All tests" })).toHaveCount(0);
  const filters = page.getByRole("group", { name: "Tests" });
  await expect(filters).toBeVisible();
  const [o, fl] = [await overview.boundingBox(), await filters.boundingBox()];
  expect(o!.y).toBeLessThan(fl!.y);
  // The filters still work.
  for (const name of ["Open", "Closed", "All"]) {
    await filters.getByRole("button", { name, exact: true }).click();
    await expect(filters.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
});

test("the Help panel of Tests describes the overview", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/tests");
  await page.getByTestId("page-help-button").click();
  const panel = page.getByRole("dialog");
  await expect(panel).toContainText("Read the Overview at the top: tests open now (submitted and missing), extensions running, published results.");
});
