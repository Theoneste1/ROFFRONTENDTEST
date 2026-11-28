/**
 * Teacher Portal navigation on a phone (owner 2026-11-27): Tests shows the overview above the tests without sideways
 * scrolling; My students shows no test overview.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";

async function noSideways(page: Page) {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
  expect(w.scroll).toBeLessThanOrEqual(w.view + 1);
}

test("Tests on a phone: the overview first, nothing sideways", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/tests");
  const overview = page.getByTestId("tests-widget-teacher");
  await expect(overview).toBeVisible();
  for (const text of ["Open now", "Extensions", "Published results"]) await expect(overview).toContainText(text);
  await noSideways(page);
});

test("My students on a phone: no test overview, nothing sideways", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/dashboard");
  await expect(page.getByRole("heading", { name: "My students", level: 1 })).toBeVisible();
  await expect(page.getByTestId("tests-widget-teacher")).toHaveCount(0);
  await noSideways(page);
});
