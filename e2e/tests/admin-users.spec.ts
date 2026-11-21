/**
 * User administration in the browser:
 *  - ACC-09: an Administrator selects two accounts and suspends them with a bulk operation (preview, reason,
 *    acknowledgement); both are suspended and the operation completes;
 *  - ACC-11: the user page's account history shows the suspension and its reason;
 *  - REG-12: the selection is exported as CSV (the file names the account; no password hash);
 *  - NOT-03: a student changes an e-mail preference, and it is still changed after a reload.
 * Two synthetic students are created per run (unique names); nothing else is modified, and the preference is restored.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { passwordOf } from "../support/accounts";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const A = { username: `bulk.a.${RUN}`, first: `BulkA${RUN}` };
const B = { username: `bulk.b.${RUN}`, first: `BulkB${RUN}` };
const REASON = "Bulk test: accounts suspended during the term review.";

async function usersFilteredToRun(page: Page) {
  await page.goto(`/admin/users?q=${RUN}`);
  await expect(page.getByLabel(`Select ${A.first} E2E`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel(`Select ${B.first} E2E`)).toBeVisible();
}

test.describe("user administration", () => {
  test.beforeAll(async () => {
    await withDb(async (c) => {
      const school = await createSchool(c, `Bulk School ${RUN}`);
      await createStudent(c, A.username, A.first, school, "VERIFIED");
      await createStudent(c, B.username, B.first, school, "VERIFIED");
    });
  });

  test("bulk suspend two accounts; the account history shows it with the reason", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await usersFilteredToRun(page);
    await page.getByLabel(`Select ${A.first} E2E`).check();
    await page.getByLabel(`Select ${B.first} E2E`).check();
    await page.getByRole("button", { name: "Act on 2 selected" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#bulk-action").selectOption("suspend");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByTestId("bulk-preview")).toBeVisible({ timeout: 30_000 });
    await dialog.locator("#bulk-reason").fill(REASON);
    if (await dialog.locator("#bulk-password").isVisible()) await dialog.locator("#bulk-password").fill(passwordOf("admin"));
    await dialog.getByRole("checkbox").last().check();
    await dialog.getByRole("button", { name: "Apply to 2 accounts" }).click();

    const states = () => withDb(async (c) => (await c.query(
      `SELECT username, "accountStatus"::text AS s FROM "User" WHERE username = ANY($1) ORDER BY username`, [[A.username, B.username]])).rows.map((r) => r.s));
    await expect.poll(states, { timeout: 60_000 }).toEqual(["SUSPENDED", "SUSPENDED"]);
    const op = await withDb(async (c) => (await c.query(
      `SELECT status::text AS status, total FROM "BulkOperation" ORDER BY "createdAt" DESC LIMIT 1`)).rows[0]);
    expect(op).toMatchObject({ total: 2 });
    await expect.poll(async () => withDb(async (c) => (await c.query(
      `SELECT status::text AS status FROM "BulkOperation" ORDER BY "createdAt" DESC LIMIT 1`)).rows[0].status), { timeout: 60_000 }).toBe("COMPLETED");

    // Account history on the user page.
    const id = await withDb((c) => idOf(c, A.username));
    await page.goto(`/admin/users/${id}`);
    const history = page.getByTestId("status-history");
    await expect(history).toBeVisible({ timeout: 30_000 });
    await expect(history).toContainText(/Suspended/i);
    await expect(history).toContainText(REASON);
  });

  test("export the selection as CSV", async ({ page }) => {
    await signIn(page, "admin");
    await usersFilteredToRun(page);
    await page.getByLabel(`Select ${A.first} E2E`).check();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByRole("button", { name: "Export 1 selected (CSV)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = readFileSync((await download.path())!, "utf8");
    expect(csv).toContain(A.username);
    expect(csv).not.toContain(B.username);
    expect(csv.toLowerCase()).not.toContain("passwordhash");
  });

  test("a student changes an e-mail preference; it persists after a reload", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/student/account");
    const prefs = page.getByTestId("email-preferences");
    await expect(prefs).toBeVisible({ timeout: 30_000 });
    const first = prefs.getByRole("switch").first();
    const before = await first.getAttribute("aria-checked");
    const label = await first.getAttribute("aria-label");
    await first.click();
    await page.getByRole("button", { name: "Save e-mail preferences" }).click();
    await expect(page.getByText("E-mail preferences saved.")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    const again = page.getByTestId("email-preferences").getByRole("switch", { name: label! });
    await expect(again).toHaveAttribute("aria-checked", before === "true" ? "false" : "true", { timeout: 30_000 });
    // Restore the fixture's preference.
    await again.click();
    await page.getByRole("button", { name: "Save e-mail preferences" }).click();
    await expect(page.getByText("E-mail preferences saved.")).toBeVisible({ timeout: 30_000 });
  });
});
