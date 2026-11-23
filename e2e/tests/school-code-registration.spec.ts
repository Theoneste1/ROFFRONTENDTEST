/**
 * A school without a code at registration (owner 2026-11-23), in a real browser against the real backend and PostgreSQL:
 * a student chooses a school that has no official code; the form asks for its code (required), explains a missing or
 * wrong-province code in plain words, and — with a valid code — creates the account; the school now has that code.
 * Synthetic data only; the school, the code and the username are unique per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { pickCountry } from "../support/signup-layout";
import { withDb } from "../support/db";

const RUN = Date.now().toString(36);
const PASSWORD = "Sign-Up-Pass-2026!";
const PLACE = { province: "Southern Province", district: "Muhanga", sector: "Muhanga" };
const SCHOOL_NAME = `Ecole Sans Code ${RUN}`;
let schoolId: string;
let code: string;

async function selectWhenReady(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    schoolId = (await c.query<{ id: string }>(
      `INSERT INTO "School" (id, name, "nameKey", location, province, district, sector, source, "countryCode")
       VALUES (gen_random_uuid()::text, $1, lower($1), 'Muhanga', $2, $3, $4, 'ADMIN', 'RW') RETURNING id`,
      [SCHOOL_NAME, PLACE.province, PLACE.district, PLACE.sector],
    )).rows[0].id;
    // A Southern Province code (first digit 2) no school has.
    for (let i = 0; ; i++) {
      code = `2${String((Date.now() + i * 7919) % 100000).padStart(5, "0")}`;
      if (Number((await c.query(`SELECT count(*) FROM "School" WHERE code = $1`, [code])).rows[0].count) === 0) break;
    }
  });
});

test("a school without a code asks for it; wrong codes are explained; with a valid code the account is created and the school has the code", async ({ page }) => {
  const username = `signup.code.${RUN}`;
  await page.goto("/register");
  await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
  await page.locator('input[name="firstName"]').fill("Clarisse");
  await page.locator('input[name="lastName"]').fill(`Code${RUN}`);
  await page.locator('input[name="gender"][value="FEMALE"]').check();
  await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
  await pickCountry(page, "home-country", "Rwanda");
  await page.locator('input[name="guardianPhone"]').fill("0788123456");
  await page.locator('select[name="gradeLevel"]').selectOption("S2");
  await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
  await page.getByTestId("cascade-country").selectOption("RW");
  await selectWhenReady(page, "cascade-province", PLACE.province);
  await selectWhenReady(page, "cascade-district", PLACE.district);
  await selectWhenReady(page, "cascade-sector", PLACE.sector);
  await selectWhenReady(page, "cascade-school", SCHOOL_NAME);
  const codeField = page.getByTestId("new-school-code");
  await expect(codeField).toBeVisible();
  await selectWhenReady(page, "home-province", "Kigali City");
  await selectWhenReady(page, "home-district", "Gasabo");
  await page.getByTestId("home-sector").selectOption({ index: 1 });
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
  await page.locator('input[name="new-password"]').fill(PASSWORD);
  await page.locator('input[name="confirm-password"]').fill(PASSWORD);

  // No code: required, said plainly.
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText(/has no code in our list yet: enter its 6-digit school code/)).toBeVisible();
  // Another province's code: explained.
  await codeField.fill("120001");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText("A school code in Southern Province starts with 2. Check the code with the school.")).toBeVisible();
  expect((await withDb(async (c) => (await c.query(`SELECT code FROM "School" WHERE id = $1`, [schoolId])).rows[0])).code).toBeNull();

  await codeField.fill(code);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByTestId("register-done")).toBeVisible({ timeout: 30_000 });
  const row = await withDb(async (c) => (await c.query(
    `SELECT s.code, u."schoolId" = s.id AS linked FROM "School" s JOIN "User" u ON u.username = $2 WHERE s.id = $1`, [schoolId, username])).rows[0]);
  expect(row).toEqual({ code, linked: true });
});
