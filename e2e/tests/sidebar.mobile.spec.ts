/**
 * Sidebar on a phone: the menu is a drawer; the items that do not fit are under "More", which expands inline inside
 * the drawer (a panel beside a narrow drawer would leave the screen). Every item stays reachable; links navigate.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test("administrator on a phone: drawer with More expanding inline; every item reachable once; a link navigates", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/dashboard");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Main menu" });
  await expect(drawer).toBeVisible();
  const nav = drawer.getByTestId("sidebar-nav");
  await nav.locator("a[href]").first().waitFor();
  const toggle = drawer.getByTestId("sidebar-more-toggle");
  if ((await toggle.count()) === 0) test.skip(true, "everything fits on this screen: no More needed");

  const panel = drawer.getByTestId("sidebar-more-panel");
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  // Inline: the panel is inside the drawer's width.
  const [d, p] = await Promise.all([drawer.boundingBox(), panel.boundingBox()]);
  expect(p!.x + p!.width).toBeLessThanOrEqual(d!.x + d!.width + 1);

  const direct = await nav.locator(":scope > a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  const more = await panel.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  const all = [...direct, ...more];
  expect(new Set(all).size).toBe(all.length);
  expect(all).toContain("/admin/users");

  const target = panel.locator("a[href]").first();
  const href = (await target.getAttribute("href"))!;
  await target.click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?|$)`));
});
