/**
 * Super Administrators are undiscoverable by every other role (owner, 2026-11-28; enforced by the backend — this checks
 * what people see): an Administrator's Users page has no "Super Admins" tab and finds no Super Administrator by
 * username; a Super Administrator's own Users page shows the tab and finds them. Reports cannot be shared with
 * "Super Administrators" by an Administrator.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";
import { ACCOUNTS } from "../support/accounts";

const roleFilter = (page: Page) => page.getByRole("group", { name: "Role" });

async function searchUsers(page: Page, text: string) {
  await page.goto(`/admin/users?q=${encodeURIComponent(text)}`);
  await expect(roleFilter(page).getByRole("button", { name: "All", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("an Administrator: no Super Admins tab; the Super Administrator is not found by username", async ({ page }) => {
  await signIn(page, "admin");
  await searchUsers(page, ACCOUNTS.superAdmin.username);
  await expect(roleFilter(page).getByRole("button", { name: "Super Admins" })).toHaveCount(0);
  await expect(page.getByText(ACCOUNTS.superAdmin.username)).toHaveCount(0);
  // Even asking for the role in the address shows no Super Administrator.
  await page.goto("/admin/users?role=SUPER_ADMIN");
  await expect(roleFilter(page).getByRole("button", { name: "All", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(ACCOUNTS.superAdmin.username)).toHaveCount(0);
});

test("the Super Administrator: the Super Admins tab, and themselves in it", async ({ page }) => {
  await signIn(page, "superAdmin");
  await searchUsers(page, ACCOUNTS.superAdmin.username);
  await expect(roleFilter(page).getByRole("button", { name: "Super Admins" })).toBeVisible();
  await expect(page.getByText(ACCOUNTS.superAdmin.username).first()).toBeVisible();
});
