/**
 * The home page's numbers and teacher entry points (owner 2026-11-22): teachers have accounts, so the Teachers card shows
 * the count of active teachers (never "not yet registered"), and every "Join as a Teacher" opens teacher registration.
 */
import { expect, test } from "@playwright/test";

test("the Teachers card shows the number of active teachers; Join as a Teacher opens teacher registration", async ({ page }) => {
  const stats = await (await page.request.get("/api/v1/public/statistics")).json();
  expect(typeof stats.teachers).toBe("number");
  expect(stats.teachers).toBeGreaterThan(0);

  await page.goto("/");
  const card = page.locator('[data-stat="teachers"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveText(String(stats.teachers));
  await expect(page.locator('[data-stat="schools"]')).toHaveText(String(stats.schools));
  await expect(page.getByText("Teachers are not yet registered on the platform.")).toHaveCount(0);

  const joins = page.getByRole("link", { name: "Join as a Teacher" });
  expect(await joins.count()).toBeGreaterThan(0);
  for (const href of await joins.evaluateAll((ls) => ls.map((l) => l.getAttribute("href")))) expect(href).toBe("/register/teacher");
});
