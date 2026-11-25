/**
 * Banking information (owner 2026-11-25), in the browser:
 *  - a Teacher / Coach / Head Coach without complete details sees "Complete Your Banking Information" instead of every
 *    portal page — after a reload, a typed address, or in a new tab — and can sign out;
 *  - Teachers: Umwalimu SACCO shown fixed for both banks (no list); 11 / 13 digits or letters → the exact message;
 *    12 digits → saved, a confirmation, then the dashboard (and never the form again);
 *  - Coaches and Head Coaches: the personal bank from the list of 12; the school bank fixed;
 *  - details saved in part are shown and kept;
 *  - Students and Administrators never see it;
 *  - Administrators: the Users list shows the status and filters by it; a person's page shows masked numbers.
 * Accounts named "bank.*" get no automatic test details (e2e/support/global-setup.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";

const SACCO = "Umwalimu SACCO";
const TEACHER_MSG = "Your Umwalimu SACCO account number must contain exactly 12 digits.";

async function makeAccount(username: string, role: "TEACHER" | "MENTOR" | "HEAD_COACH", partial?: Record<string, string>) {
  const { hashSync } = await import("bcryptjs");
  await withDb(async (c) => {
    await c.query(`DELETE FROM "User" WHERE username = $1`, [username]);
    const id = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt", gender)
       VALUES (gen_random_uuid()::text, $1, 'Bank', 'Person', $2, $3::"Role", $4, now(), true, now(), 'FEMALE') RETURNING id`,
      [username, `${username}@e2e.local`, role, hashSync(PASSWORD, 10)],
    )).rows[0].id;
    if (partial) {
      await c.query(
        `INSERT INTO "UserBankDetails" ("userId", "personalAccountName", "personalBankName", "updatedAt") VALUES ($1, $2, $3, now())`,
        [id, partial.personalAccountName, partial.personalBankName],
      );
    }
  });
}

const step = (page: Page) => page.getByTestId("banking-step");
const fill = async (page: Page, values: Record<string, string>) => {
  for (const [k, v] of Object.entries(values)) await page.locator(`#banking-${k}`).fill(v);
};

test.describe("banking information", () => {
  test.beforeAll(async () => {
    await makeAccount("bank.teacher", "TEACHER");
    await makeAccount("bank.coach", "MENTOR");
    await makeAccount("bank.hc", "HEAD_COACH", { personalAccountName: "Partial Person", personalBankName: "Ecobank Rwanda Plc" });
  });

  test("teacher: held at the step everywhere; fixed banks; 12 digits exactly; then the dashboard, never the form again", async ({ page, context }) => {
    await signInWith(page, "bank.teacher", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Complete Your Banking Information" })).toBeVisible();

    // No way around it: a reload, a typed address, another tab.
    await page.reload();
    await expect(step(page)).toBeVisible();
    await page.goto("/teacher/dashboard");
    await expect(step(page)).toBeVisible();
    const other = await context.newPage();
    await other.goto("/teacher/tests");
    await expect(other.getByTestId("banking-step")).toBeVisible();
    await other.close();

    // Both banks fixed: shown, no list to choose from.
    await expect(page.getByTestId("banking-fixed-personalBankName")).toHaveText(SACCO);
    await expect(page.getByTestId("banking-fixed-schoolBankName")).toHaveText(SACCO);
    await expect(page.locator("select")).toHaveCount(0);

    // Required fields, then the 12-digit rule (nothing cut or changed).
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-personalAccountName-error")).toHaveText("Bank account name is required.");
    await expect(page.locator("#banking-schoolAccountName-error")).toHaveText("School bank account name is required.");
    await fill(page, { personalAccountName: "Bank Person", schoolAccountName: "GS Kigali", schoolAccountNumber: "4001234567" });
    for (const n of ["12345678901", "1234567890123", "12345678901A"]) {
      await fill(page, { personalAccountNumber: n });
      await page.getByTestId("banking-submit").click();
      await expect(page.getByText(TEACHER_MSG)).toBeVisible();
      await expect(page.locator("#banking-personalAccountNumber")).toHaveValue(n);
    }
    await fill(page, { personalAccountNumber: "123456789012" });
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
    await page.getByTestId("banking-continue").click();
    await expect(page.getByTestId("sidebar-nav").or(page.getByRole("button", { name: "Toggle Sidebar" })).first()).toBeVisible();
    await page.reload();
    await expect(step(page)).toHaveCount(0);
  });

  test("coach: the personal bank from the list of 12; the school bank fixed", async ({ page }) => {
    await signInWith(page, "bank.coach", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    const bank = page.locator("#banking-personalBankName");
    await expect(bank.locator("option")).toHaveCount(13);   // "Choose your bank" + the 12 banks
    await expect(page.getByTestId("banking-fixed-schoolBankName")).toHaveText(SACCO);
    await fill(page, { personalAccountName: "Bank Coach", personalAccountNumber: "00012345678", schoolAccountName: "GS Huye", schoolAccountNumber: "4009876543" });
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-personalBankName-error")).toHaveText("Bank name is required.");
    await bank.selectOption("Bank of Kigali Plc");
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
  });

  test("head coach: details saved in part are shown and kept; only the missing ones asked", async ({ page }) => {
    await signInWith(page, "bank.hc", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    await expect(page.getByText(/Some of your details are already saved/)).toBeVisible();
    await expect(page.locator("#banking-personalAccountName")).toHaveValue("Partial Person");
    await expect(page.locator("#banking-personalBankName")).toHaveValue("Ecobank Rwanda Plc");
    await fill(page, { personalAccountNumber: "00012345678", schoolAccountName: "GS Musanze", schoolAccountNumber: "4005556667" });
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
  });

  test("students and administrators never see the step", async ({ page }) => {
    for (const who of ["student", "admin"] as const) {
      await signIn(page, who);
      await expect(step(page)).toHaveCount(0);
      await page.context().clearCookies();
    }
  });

  test("administrators: status in the Users list, filter, masked numbers on the person's page", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/users?role=TEACHER&banking=COMPLETE");
    const row = page.getByRole("row").filter({ hasText: "bank.teacher@e2e.local" });
    await expect(row.getByTestId("banking-status")).toHaveText("Complete");
    await page.goto("/admin/users?role=TEACHER&banking=INCOMPLETE");
    await expect(page.getByRole("row").filter({ hasText: "bank.teacher@e2e.local" })).toHaveCount(0);

    const id = await withDb(async (c) => (await c.query<{ id: string }>(`SELECT id FROM "User" WHERE username = 'bank.teacher'`)).rows[0].id);
    await page.goto(`/admin/users/${id}`);
    await expect(page.getByTestId("banking-personalAccountNumber")).toHaveText("•••• 9012");
    await page.getByTestId("banking-reveal").click();
    await expect(page.getByTestId("banking-personalAccountNumber")).toHaveText("123456789012");
  });
});

test.describe("banking information on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test("the step fits a phone: no sideways scroll", async ({ page }) => {
    await makeAccount("bank.phone", "MENTOR");
    await signInWith(page, "bank.phone", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth)).toBeLessThanOrEqual(0);
  });
});
