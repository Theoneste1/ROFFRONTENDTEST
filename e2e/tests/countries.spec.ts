/**
 * Countries in the browser (owner decision 2026-11-19; INT-01, INT-02, REG-03): ROF is a global Olympiad platform — one
 * common structure (S1–S6; Junior / Senior) for every country, and no country is ever blocked.
 *  - an Administrator corrects a country's calling code on the Countries screen (audited), then restores it;
 *  - a student whose school is abroad registers with the country chosen from the list and a typed school name (as today);
 *  - a Rwandan student still registers exactly as before (Province → District → Sector → School, S1–S6).
 * Each result is checked in the database. Synthetic data only; names are unique per run.
 * The student form shows one step at a time: each step is filled, then "Next" (e2e/support/wizard).
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";
import { nextStep } from "../support/wizard";

const RUN = Date.now().toString(36);
const PASSWORD = "Sign-Up-Pass-2026!";
const SCHOOL = { name: "ACEJ KARAMA", province: "Southern Province", district: "Muhanga", sector: "Muhanga" };

async function selectWhenReady(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

async function submitAndExpect(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: "Create my account" }).click();
    const outcome = await Promise.race([
      page.getByTestId("register-done").waitFor({ timeout: 30_000 }).then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") break;
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
  await expect(page.getByTestId("register-done")).toBeVisible({ timeout: 30_000 });
}

/**
 * The parts of the student form that are the same wherever the school is: "About you", the grade and the Olympiad
 * interest, the test's own school step (`school`), "Where you live" and "Your account".
 */
async function studentBasics(page: Page, username: string, grade: string, school: () => Promise<void>) {
  await page.goto("/register");
  await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
  await page.locator('input[name="firstName"]').fill("Grace");
  await page.locator('input[name="lastName"]').fill(`Country${RUN}`);
  await page.locator('input[name="dateOfBirth"]').fill("2011-03-10");
  await page.getByTestId("home-country").selectOption("RW");
  await page.locator('input[name="guardianPhone"]').fill("0788123456");
  await nextStep(page, "Your studies");
  await page.locator('select[name="gradeLevel"]').selectOption(grade);
  await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
  await nextStep(page, "Your school");
  await school();
  await nextStep(page, "Where you live");
  await selectWhenReady(page, "home-province", "Kigali City");
  await selectWhenReady(page, "home-district", "Gasabo");
  const sector = page.getByTestId("home-sector");
  await expect(sector).toBeEnabled();
  await sector.selectOption({ index: 1 });
  await nextStep(page, "Your account");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
  await page.locator('input[name="new-password"]').fill(PASSWORD);
  await page.locator('input[name="confirm-password"]').fill(PASSWORD);
}

test.describe.serial("countries", () => {
  test("an Administrator corrects a country's calling code on the Countries screen; the change is audited", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/admin/countries");
    await expect(page.getByRole("heading", { name: "Countries" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("country-RW")).toContainText("+250");
    // No on / off switch: no country is ever blocked.
    await expect(page.getByRole("button", { name: /Switch (on|off)/ })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search countries" }).fill("Antarctica");
    const row = page.getByTestId("country-AQ");
    await expect(row).toBeVisible();
    await expect(page.getByTestId("admin-countries").locator("tr")).toHaveCount(1);
    const edit = async (prefix: string) => {
      await row.getByRole("button", { name: "Edit Antarctica" }).click();
      const dialog = page.getByRole("dialog", { name: "Edit Antarctica" });
      await dialog.getByLabel("Calling code").fill(prefix);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
    };
    // The form refuses a malformed calling code before sending anything.
    await row.getByRole("button", { name: "Edit Antarctica" }).click();
    const bad = page.getByRole("dialog", { name: "Edit Antarctica" });
    await bad.getByLabel("Calling code").fill("672");
    await bad.getByRole("button", { name: "Save" }).click();
    await expect(bad.getByText("“+” followed by 1 to 4 digits, e.g. +254.")).toBeVisible();
    await bad.getByRole("button", { name: "Cancel" }).click();
    await edit("+672");
    await expect(row).toContainText("+672");
    const audit = await withDb(async (c) => (await c.query(
      `SELECT metadata FROM "AuditLog" WHERE action = 'COUNTRY_UPDATED' AND "entityId" = 'AQ' ORDER BY "createdAt" DESC LIMIT 1`)).rows[0]);
    expect(audit.metadata).toEqual({ country: "AQ", changes: { phonePrefix: { from: null, to: "+672" } } });
    // Back to the seeded state (no calling code), so later runs start the same.
    await edit("");
    await expect(row).toContainText("—");
  });

  test("a student whose school is abroad registers with the country from the list and the school's name (as today)", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `cty.abroad.${RUN}`;
    await studentBasics(page, username, "S4", async () => {
      const country = page.getByTestId("cascade-country");
      // Every country is offered (no country is blocked).
      await expect(country.locator("option[value]:not([value=''])")).toHaveCount(249, { timeout: 30_000 });
      await country.selectOption("KE");
      await expect(page.getByTestId("cascade-province")).toHaveCount(0);   // no hierarchy outside Rwanda
      await page.getByLabel("School name").fill("Alliance High School");
    });
    await submitAndExpect(page);
    const row = await withDb(async (c) => (await c.query(
      `SELECT u."gradeLevel"::text AS level, d.code::text AS division, a."claimedCountry", a."claimedName", a."schoolId"
         FROM "User" u JOIN "Division" d ON d.id = u."divisionId" JOIN "StudentSchoolAffiliation" a ON a."studentId" = u.id
        WHERE u.username = $1`, [username])).rows[0]);
    expect(row).toEqual({ level: "S4", division: "SENIOR", claimedCountry: "KE", claimedName: "Alliance High School", schoolId: null });
  });

  test("a Rwandan student registers exactly as before (directory school, S1–S6)", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `cty.rwanda.${RUN}`;
    await studentBasics(page, username, "S2", async () => {
      await page.getByTestId("cascade-country").selectOption("RW");
      await selectWhenReady(page, "cascade-province", SCHOOL.province);
      await selectWhenReady(page, "cascade-district", SCHOOL.district);
      await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
      await selectWhenReady(page, "cascade-school", SCHOOL.name);
    });
    await submitAndExpect(page);
    const row = await withDb(async (c) => (await c.query(
      `SELECT u."gradeLevel"::text AS level, d.code::text AS division, s.name AS school FROM "User" u
         JOIN "Division" d ON d.id = u."divisionId" JOIN "School" s ON s.id = u."schoolId" WHERE u.username = $1`, [username])).rows[0]);
    expect(row).toEqual({ level: "S2", division: "JUNIOR", school: SCHOOL.name });
  });
});
