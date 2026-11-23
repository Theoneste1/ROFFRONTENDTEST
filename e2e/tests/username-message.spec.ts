/**
 * Usernames (owner feedback 2026-11-24): someone who types their e-mail address — the owner's real example, in quotation
 * marks — is told plainly that a username is not an e-mail address, with a username that would work. Nothing is sent.
 */
import { expect, test } from "@playwright/test";

test("student sign-up: an e-mail address typed as the username is explained, with a suggestion; the hint says what a username is", async ({ page }) => {
  await page.goto("/register");
  const username = page.locator('input[name="username"]');
  await username.waitFor({ timeout: 60_000 });
  await expect(page.getByText("The name you will sign in with — not your e-mail address.", { exact: false })).toBeVisible();
  await username.fill('"tuyizerethe1997,_@gmail.com"');
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText("A username is not an e-mail address. Use only the part before “@”", { exact: false })).toBeVisible();
  await expect(page.getByText("For example: tuyizerethe1997", { exact: false })).toBeVisible();
});

test("teacher sign-up shows the same hint", async ({ page }) => {
  await page.goto("/register/teacher");
  await page.locator('input[name="username"]').waitFor({ timeout: 60_000 });
  await expect(page.getByText("The name you will sign in with — not your e-mail address.", { exact: false })).toBeVisible();
});
