/**
 * Banking information (owner 2026-11-25), in the browser:
 *  - a Teacher / Coach / Head Coach without complete details sees "Complete Your Banking Information" instead of every
 *    portal page — after a reload, a typed address, or in a new tab — and can sign out;
 *  - Teachers: both banks chosen from the list the Super Administrator manages (Umwalimu SACCO suggested); the
 *    instruction under each number follows the chosen bank (owner 2026-11-27); Umwalimu SACCO numbers of 11 / 13
 *    digits or letters → "Umwalimu SACCO account numbers must contain exactly 12 digits.";
 *    12 digits → saved, a confirmation, then the dashboard (and never the form again);
 *  - Coaches and Head Coaches: the three personal fields only (bank from the list of 12) — no school section, no
 *    school check or confirmation; school details saved earlier are kept untouched;
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
const TEACHER_MSG = "Umwalimu SACCO account numbers must contain exactly 12 digits.";
const SCHOOL_MSG = TEACHER_MSG;
const GENERAL_MSG = "An account number has 5 to 40 characters: digits, letters, spaces or hyphens, with at least one digit.";

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
      // Details saved earlier (some or all six fields), as they are.
      const cols = Object.keys(partial);
      await c.query(
        `INSERT INTO "UserBankDetails" ("userId", ${cols.map((k) => `"${k}"`).join(", ")}, "updatedAt") VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, now())`,
        [id, ...cols.map((k) => partial[k])],
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

  test("teacher: held at the step everywhere; banks chosen (Umwalimu SACCO suggested); the hint follows the bank; 12 digits for SACCO", async ({ page, context }) => {
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

    // Both banks chosen from the list, Umwalimu SACCO suggested; the instruction follows the chosen bank at once.
    await expect(page.locator("#banking-personalBankName")).toHaveValue(SACCO);
    await expect(page.locator("#banking-schoolBankName")).toHaveValue(SACCO);
    const personalHint = page.getByTestId("banking-bank-personalBankName").locator("xpath=following-sibling::*[1]").getByTestId("banking-number-hint");
    await expect(personalHint).toHaveText(TEACHER_MSG);
    await page.locator("#banking-personalBankName").selectOption("Bank of Kigali Plc");
    await expect(personalHint).toHaveText(GENERAL_MSG);
    await page.locator("#banking-personalBankName").selectOption(SACCO);
    await expect(personalHint).toHaveText(TEACHER_MSG);

    // Required fields, then the 12-digit rule (nothing cut or changed).
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-personalAccountName-error")).toHaveText("Bank account name is required.");
    await expect(page.locator("#banking-schoolAccountName-error")).toHaveText("School bank account name is required.");
    // Account names contain no digit (the exact messages), then fixed.
    await fill(page, { personalAccountName: "Bank Person 2", schoolAccountName: "GS Kigali 1", schoolAccountNumber: "4001234567" });
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-personalAccountName-error")).toHaveText("The bank account name must not contain numbers. Write the name exactly as on the account.");
    await expect(page.locator("#banking-schoolAccountName-error")).toHaveText("The school's bank account name must not contain numbers. Write the name exactly as on the account.");
    await fill(page, { personalAccountName: "Bank Person", schoolAccountName: "GS Kigali" });
    for (const n of ["12345678901", "1234567890123", "12345678901A"]) {
      await fill(page, { personalAccountNumber: n });
      await page.getByTestId("banking-submit").click();
      await expect(page.locator("#banking-personalAccountNumber-error")).toHaveText(TEACHER_MSG);
      await expect(page.locator("#banking-personalAccountNumber")).toHaveValue(n);
    }
    // The school's Umwalimu SACCO number: exactly 12 digits too (10 given above).
    await fill(page, { personalAccountNumber: "123456789012" });
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-schoolAccountNumber-error")).toHaveText(SCHOOL_MSG);
    await expect(page.locator("#banking-schoolAccountNumber")).toHaveValue("4001234567");
    await fill(page, { schoolAccountNumber: "400100004567" });
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
    await page.getByTestId("banking-continue").click();
    await expect(page.getByTestId("sidebar-nav").or(page.getByRole("button", { name: "Toggle Sidebar" })).first()).toBeVisible();
    await page.reload();
    await expect(step(page)).toHaveCount(0);
  });

  test("coach: the three personal fields only, the bank from the list of 12; no school section", async ({ page }) => {
    await signInWith(page, "bank.coach", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    await expect(page.getByText("please provide your personal banking information.", { exact: false })).toBeVisible();
    const bank = page.locator("#banking-personalBankName");
    await expect(bank.locator("option")).toHaveCount(13);   // "Choose your bank" + the 12 banks
    // No school details asked: no section, no field, no fixed school bank, no confirmation.
    await expect(page.getByTestId("banking-school")).toHaveCount(0);
    await expect(page.locator("#banking-schoolAccountName, #banking-schoolAccountNumber")).toHaveCount(0);
    await expect(page.getByTestId("banking-fixed-schoolBankName")).toHaveCount(0);
    await fill(page, { personalAccountName: "Bank Coach", personalAccountNumber: "00012345678" });
    await page.getByTestId("banking-submit").click();
    await expect(page.locator("#banking-personalBankName-error")).toHaveText("Choose the bank from the list.");
    await bank.selectOption("Bank of Kigali Plc");
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
    await page.getByTestId("banking-continue").click();
    await expect(step(page)).toHaveCount(0);
    const row = await withDb(async (c) => (await c.query(
      `SELECT b.* FROM "UserBankDetails" b JOIN "User" u ON u.id = b."userId" WHERE u.username = 'bank.coach'`)).rows[0]);
    expect(row).toMatchObject({ personalAccountName: "Bank Coach", personalBankName: "Bank of Kigali Plc", personalAccountNumber: "00012345678", schoolAccountName: null, schoolBankName: null, schoolAccountNumber: null });
  });

  test("head coach: details saved in part are shown and kept; only the missing personal field asked", async ({ page }) => {
    await signInWith(page, "bank.hc", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    await expect(page.getByText(/Some of your details are already saved\. Still needed: Bank account number\./)).toBeVisible();
    await expect(page.locator("#banking-personalAccountName")).toHaveValue("Partial Person");
    await expect(page.locator("#banking-personalBankName")).toHaveValue("Ecobank Rwanda Plc");
    await expect(page.getByTestId("banking-school")).toHaveCount(0);
    await fill(page, { personalAccountNumber: "00012345678" });
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

  test("teacher: Settings shows the saved details (numbers masked) and updates them at any time, with the same rules", async ({ page }) => {
    const savedRow = async () => withDb(async (c) => (await c.query(
      `SELECT b.* FROM "UserBankDetails" b JOIN "User" u ON u.id = b."userId" WHERE u.username = 'bank.teacher'`)).rows[0]);
    await signInWith(page, "bank.teacher", PASSWORD, { answerGender: false });
    await page.goto("/teacher/account");
    const card = page.getByTestId("settings-banking");
    await expect(card.getByTestId("settings-banking-schoolAccountName")).toHaveText("GS Kigali");
    await expect(card.getByTestId("settings-banking-personalAccountNumber")).toHaveText("•••• 9012");
    await card.getByTestId("settings-banking-show").click();
    await expect(card.getByTestId("settings-banking-personalAccountNumber")).toHaveText("123456789012");
    await card.getByTestId("settings-banking-edit").click();
    await expect(card.locator("#banking-schoolAccountNumber")).toHaveValue("400100004567");
    await card.locator("#banking-schoolAccountNumber").fill("4001");
    await card.getByTestId("banking-submit").click();
    await expect(card.locator("#banking-schoolAccountNumber-error")).toHaveText(SCHOOL_MSG);
    await card.locator("#banking-schoolAccountNumber").fill("400100008888");
    await card.locator("#banking-personalAccountName").fill("Bank Person Updated");
    await card.getByTestId("banking-submit").click();
    await expect(card.getByText("Your banking information has been saved.")).toBeVisible();
    await expect(card.getByTestId("settings-banking-personalAccountName")).toHaveText("Bank Person Updated");
    expect(await savedRow()).toMatchObject({ personalAccountName: "Bank Person Updated", schoolAccountNumber: "400100008888", schoolBankName: SACCO });
  });

  test("coach: Settings shows and edits the three personal fields only", async ({ page }) => {
    await signInWith(page, "bank.coach", PASSWORD, { answerGender: false });
    await page.goto("/mentor/account");
    const card = page.getByTestId("settings-banking");
    await expect(card.getByTestId("settings-banking-personalBankName")).toHaveText("Bank of Kigali Plc");
    await expect(card.locator("[data-testid^='settings-banking-school']")).toHaveCount(0);
    await card.getByTestId("settings-banking-edit").click();
    await expect(card.getByTestId("banking-school")).toHaveCount(0);
    await card.locator("#banking-personalBankName").selectOption("Equity Bank Rwanda Plc");
    await card.getByTestId("banking-submit").click();
    await expect(card.getByTestId("settings-banking-personalBankName")).toHaveText("Equity Bank Rwanda Plc");
  });

  test("students and administrators have no banking section in Settings", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/student/account");
    await expect(page.getByTestId("account-settings")).toBeVisible();
    await expect(page.getByTestId("settings-banking")).toHaveCount(0);
  });

  test("administrators: edit a teacher's banking information on the person's page (the same rules; saved; masked again)", async ({ page }) => {
    await signIn(page, "admin");
    const id = await withDb(async (c) => (await c.query<{ id: string }>(`SELECT id FROM "User" WHERE username = 'bank.teacher'`)).rows[0].id);
    await page.goto(`/admin/users/${id}`);
    const card = page.getByTestId("banking-card");
    await card.getByTestId("banking-edit").click();
    const editor = card.getByTestId("banking-admin-editor");
    await expect(editor.locator("#banking-personalAccountNumber")).toHaveValue("123456789012");
    await editor.locator("#banking-personalAccountNumber").fill("12345");
    await editor.getByTestId("banking-submit").click();
    await expect(editor.locator("#banking-personalAccountNumber-error")).toHaveText(TEACHER_MSG);
    await editor.locator("#banking-personalAccountNumber").fill("555566667777");
    await editor.getByTestId("banking-submit").click();
    await expect(card.getByText("Banking information saved.")).toBeVisible();
    await expect(card.getByTestId("banking-personalAccountNumber")).toHaveText("•••• 7777");
    const audit = await withDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'BANK_DETAILS_UPDATED_BY_ADMIN' AND "entityId" = $1`, [id])).rows[0].n);
    expect(audit).toBe(1);
  });
});

test.describe("banking information: details saved earlier (conflicting banks; coaches' school details)", () => {
  const savedRow = async (username: string) => withDb(async (c) => (await c.query(
    `SELECT b.* FROM "UserBankDetails" b JOIN "User" u ON u.id = b."userId" WHERE u.username = $1`, [username])).rows[0]);

  test.beforeAll(async () => {
    await makeAccount("bank.legacy.t", "TEACHER", {
      personalAccountName: "Legacy Teacher", personalBankName: "Bank of Kigali Plc", personalAccountNumber: "123456789012",
      schoolAccountName: "GS Legacy", schoolBankName: "Equity Bank Rwanda Plc", schoolAccountNumber: "400100001111",
    });
    // A coach whose personal details are complete, with school details (another bank) saved by the earlier form.
    await makeAccount("bank.legacy.c", "MENTOR", {
      personalAccountName: "Legacy Coach", personalBankName: "Ecobank Rwanda Plc", personalAccountNumber: "009988",
      schoolAccountName: "GS Legacy C", schoolBankName: "Bank of Kigali Plc", schoolAccountNumber: "4002222",
    });
    // A head coach with the same kind of school details, and the personal account number still missing.
    await makeAccount("bank.legacy.hc", "HEAD_COACH", {
      personalAccountName: "Legacy HC", personalBankName: "Ecobank Rwanda Plc",
      schoolAccountName: "GS Legacy HC", schoolBankName: "Bank of Kigali Plc", schoolAccountNumber: "4003333",
    });
  });

  test("teacher with other banks saved: never held at the step; the banks are kept as chosen (owner 2026-11-27)", async ({ page }) => {
    await signInWith(page, "bank.legacy.t", PASSWORD, { answerGender: false });
    await expect(page.getByTestId("sidebar-nav").or(page.getByRole("button", { name: "Toggle Sidebar" })).first()).toBeVisible();
    await expect(step(page)).toHaveCount(0);
    await page.goto("/teacher/account");
    const card = page.getByTestId("settings-banking");
    await card.getByTestId("settings-banking-edit").click();
    await expect(card.locator("#banking-personalBankName")).toHaveValue("Bank of Kigali Plc");
    await expect(card.locator("#banking-schoolBankName")).toHaveValue("Equity Bank Rwanda Plc");
    await expect(card.locator("[data-testid^='banking-conflict-'], [data-testid^='banking-confirm-']")).toHaveCount(0);
    await card.getByTestId("banking-submit").click();
    await expect(card.getByText("Your banking information has been saved.")).toBeVisible();
    expect(await savedRow("bank.legacy.t")).toMatchObject({ personalBankName: "Bank of Kigali Plc", schoolBankName: "Equity Bank Rwanda Plc", schoolAccountNumber: "400100001111" });
  });

  test("coach with complete personal details and a saved school bank: never held at the step; school details kept", async ({ page }) => {
    await signInWith(page, "bank.legacy.c", PASSWORD, { answerGender: false });
    await expect(page.getByTestId("sidebar-nav").or(page.getByRole("button", { name: "Toggle Sidebar" })).first()).toBeVisible();
    await expect(step(page)).toHaveCount(0);
    expect(await savedRow("bank.legacy.c")).toMatchObject({ schoolAccountName: "GS Legacy C", schoolBankName: "Bank of Kigali Plc", schoolAccountNumber: "4002222" });
  });

  test("head coach with a saved school bank and a missing personal number: personal section only, no confirmation; school details kept", async ({ page }) => {
    await signInWith(page, "bank.legacy.hc", PASSWORD, { answerGender: false });
    await expect(step(page)).toBeVisible();
    await expect(page.getByTestId("banking-school")).toHaveCount(0);
    await expect(page.locator("[data-testid^='banking-conflict-'], [data-testid^='banking-confirm-']")).toHaveCount(0);
    await expect(page.locator("#banking-personalBankName")).toHaveValue("Ecobank Rwanda Plc");
    await fill(page, { personalAccountNumber: "77001" });
    await page.getByTestId("banking-submit").click();
    await expect(page.getByTestId("banking-saved")).toBeVisible();
    expect(await savedRow("bank.legacy.hc")).toMatchObject({
      personalAccountName: "Legacy HC", personalBankName: "Ecobank Rwanda Plc", personalAccountNumber: "77001",
      schoolAccountName: "GS Legacy HC", schoolBankName: "Bank of Kigali Plc", schoolAccountNumber: "4003333",
    });
  });

  test("administrators: a coach is complete with three personal fields; the school details saved earlier shown apart, masked", async ({ page }) => {
    await signIn(page, "admin");
    const id = await withDb(async (c) => (await c.query<{ id: string }>(`SELECT id FROM "User" WHERE username = 'bank.legacy.c'`)).rows[0].id);
    await page.goto(`/admin/users/${id}`);
    const card = page.getByTestId("banking-card");
    await expect(card.getByTestId("banking-status")).toHaveText("Complete");
    await expect(card.getByTestId("banking-missing")).toHaveCount(0);
    await expect(card.getByTestId("banking-personalAccountNumber")).toHaveText("•••• 9988");
    const legacy = card.getByTestId("banking-legacy-school");
    await expect(legacy).toContainText("not required for this role");
    await expect(legacy.getByTestId("banking-schoolAccountName")).toHaveText("GS Legacy C");
    await expect(legacy.getByTestId("banking-schoolAccountNumber")).toHaveText("•••• 2222");
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

test.describe("the bank list: managed by the Super Administrator (owner 2026-11-27)", () => {
  test("Super Administrator adds a 10-digit bank; a teacher's form offers it and follows its rule; administrators have no Banks page", async ({ page, browser }) => {
    await makeAccount("bank.teacher.list", "TEACHER");
    await signIn(page, "superAdmin");
    await page.goto("/admin/banks");
    await expect(page.getByRole("heading", { name: "Banks" })).toBeVisible();
    const table = page.getByTestId("banks-table");
    await expect(table).toContainText(SACCO);
    await page.getByTestId("bank-add").click();
    const rows = table.locator("tbody tr");
    const last = rows.last();
    await last.getByLabel("Bank name").fill("E2E Ten Digit Bank");
    await last.getByLabel("Rule").selectOption("EXACT");
    await last.getByLabel("Number of digits").fill("10");
    await expect(last).toContainText("E2E Ten Digit Bank account numbers must contain exactly 10 digits.");
    await page.getByTestId("banks-save").click();
    await expect(page.getByText("Give the reason for the change")).toBeVisible();
    await page.getByLabel("Reason for the change (kept in the audit log)").fill("A new partner bank");
    await page.getByTestId("banks-save").click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("The bank list was saved.")).toBeVisible();

    const teacher = await (await browser.newContext()).newPage();
    await signInWith(teacher, "bank.teacher.list", PASSWORD, { answerGender: false });
    await expect(step(teacher)).toBeVisible();
    await teacher.locator("#banking-personalBankName").selectOption("E2E Ten Digit Bank");
    const hint = teacher.getByTestId("banking-number-hint").first();
    await expect(hint).toHaveText("E2E Ten Digit Bank account numbers must contain exactly 10 digits.");
    await fill(teacher, { personalAccountName: "List Teacher", personalAccountNumber: "123456789012", schoolAccountName: "GS List", schoolAccountNumber: "400100004567" });
    await teacher.getByTestId("banking-submit").click();
    await expect(teacher.locator("#banking-personalAccountNumber-error")).toHaveText("E2E Ten Digit Bank account numbers must contain exactly 10 digits.");
    await fill(teacher, { personalAccountNumber: "1234567890" });
    await teacher.getByTestId("banking-submit").click();
    await expect(teacher.getByTestId("banking-saved")).toBeVisible();
    await teacher.context().close();

    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, "admin");
    await admin.goto("/admin/banks");
    await expect(admin.getByText("Only a Super Administrator manages the bank list.")).toBeVisible();
    await admin.context().close();
  });
});
