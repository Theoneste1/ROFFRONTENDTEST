/**
 * "My school is not listed" with the school's official details (owner decision 2026-11-22), in a real browser against
 * the real backend and PostgreSQL:
 *  1. choosing "My school is not listed" asks for the official name, the 6-digit code, cell and village (optional),
 *     ownership and day / boarding; the place is the one chosen above;
 *  2. a code that belongs to a listed school is refused, naming that school;
 *  3. with a free code the application is sent and waits for an administrator;
 *  4. the Administrator sees the details and approves in ONE step: the school is created from the applicant's details
 *     (nothing typed again) and the teacher's account is linked to it.
 * Synthetic data only; usernames and codes are unique per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { pickCountry } from "../support/signup-layout";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const PASSWORD = "Sign-Up-Pass-2026!";
const PLACE = { province: "Southern Province", district: "Muhanga", sector: "Muhanga" };
const NEW_CODE = String(280_000 + (Date.now() % 19_000));          // Southern Province codes start with 2; free per run
const SCHOOL_NAME = `E2E UNLISTED SCHOOL ${RUN}`.toUpperCase();
const LISTED = { name: `E2E LISTED SCHOOL ${RUN}`.toUpperCase(), code: String(260_000 + (Date.now() % 19_000)) };
const username = `signup.unlisted.${RUN}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    await c.query(
      `INSERT INTO "School" (id, name, location, code, province, district, sector, "nameKey", source, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Muhanga, Muhanga', $2, $3, $4, $5, lower($1), 'OFFICIAL_LIST', now())`,
      [LISTED.name, LISTED.code, PLACE.province, PLACE.district, PLACE.sector],
    );
  });
});

async function selectWhenReady(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

test("the teacher gives the school's official details; a listed code is refused naming the school", async ({ page }) => {
  await page.goto("/register/teacher");
  const form = page.getByTestId("teacher-register-form");
  await form.waitFor({ timeout: 60_000 });
  await form.locator('input[name="firstName"]').fill("Aline");
  await form.locator('input[name="lastName"]').fill(`Unlisted${RUN}`);
  await form.locator('input[name="gender"][value="FEMALE"]').check();
  await form.locator('input[name="email"]').fill(`${username}@e2e.local`);
  await pickCountry(page, "home-country", "Rwanda");
  await form.locator('input[name="phone"]').fill("0788654322");
  await form.locator('select[name="position"]').selectOption({ index: 1 });
  await form.getByLabel("Mathematics").check();
  const schoolCountry = page.getByTestId("teacher-school-country");
  if (await schoolCountry.isEnabled()) await schoolCountry.selectOption("RW");
  await selectWhenReady(page, "cascade-province", PLACE.province);
  await selectWhenReady(page, "cascade-district", PLACE.district);
  await selectWhenReady(page, "cascade-sector", PLACE.sector);
  await selectWhenReady(page, "cascade-school", "My school is not listed");

  // 1. The details box, per the approved mock-up.
  const box = page.getByTestId("unlisted-school");
  await expect(box).toBeVisible();
  await expect(box.getByText("Your school's details")).toBeVisible();
  await expect(page.getByTestId("unlisted-school-place")).toHaveText(`Place: ${PLACE.sector}, ${PLACE.district}, ${PLACE.province} (chosen above)`);
  await expect(box.getByText("Cell (optional)")).toBeVisible();
  await expect(box.getByText("Village (optional)")).toBeVisible();

  await selectWhenReady(page, "home-province", "Kigali City");
  await selectWhenReady(page, "home-district", "Gasabo");
  await expect(page.getByTestId("home-sector")).toBeEnabled();
  await page.getByTestId("home-sector").selectOption({ index: 1 });
  await form.locator('input[name="username"]').fill(username);
  await page.locator('input[name="new-password"]').fill(PASSWORD);
  await page.locator('input[name="confirm-password"]').fill(PASSWORD);

  // Required details are checked before anything is sent.
  await box.locator('input[name="proposedSchoolName"]').fill(SCHOOL_NAME);
  await page.getByRole("button", { name: "Apply as a teacher" }).click();
  await expect(box.getByText("Enter the school's 6-digit code from the Ministry of Education list.")).toBeVisible();
  await expect(box.getByText("Choose who owns the school.")).toBeVisible();
  await expect(box.getByText("Choose day, boarding, or day and boarding.")).toBeVisible();

  // 2. A code of a listed school: refused by the server, naming the school.
  await box.locator('input[name="proposedSchoolCode"]').fill(LISTED.code);
  await box.locator('input[name="proposedSchoolCell"]').fill("Gahogo");
  await box.locator('input[name="proposedSchoolVillage"]').fill("Kavumu");
  await page.getByTestId("unlisted-school-ownership").selectOption("GOVERNMENT_AIDED");
  await page.getByTestId("unlisted-school-accommodation").selectOption("BOARDING");
  await page.getByRole("button", { name: "Apply as a teacher" }).click();
  await expect(box.getByText(new RegExp(`This code belongs to ${LISTED.name} \\(${PLACE.district}, ${PLACE.sector}\\), which is already listed`))).toBeVisible({ timeout: 30_000 });
  const none = await withDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0].n);
  expect(none).toBe(0);

  // 3. A free code: sent, pending.
  await box.locator('input[name="proposedSchoolCode"]').fill(NEW_CODE);
  await page.getByRole("button", { name: "Apply as a teacher" }).click();
  await expect(page.getByTestId("teacher-register-done")).toBeVisible({ timeout: 60_000 });
  const app = await withDb(async (c) => (await c.query(
    `SELECT status::text AS status, "proposedSchoolName" AS name, "proposedSchoolCode" AS code, "proposedSchoolCell" AS cell,
            "proposedSchoolVillage" AS village, "proposedSchoolOwnership" AS ownership, "proposedSchoolAccommodation"::text AS accommodation
       FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0]);
  expect(app).toEqual({ status: "PENDING", name: SCHOOL_NAME, code: NEW_CODE, cell: "Gahogo", village: "Kavumu", ownership: "GOVERNMENT_AIDED", accommodation: "BOARDING" });
});

test("the Administrator approves in one step: the school is created from the applicant's details", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/teacher-applications");
  const row = page.getByTestId("teacher-applications").locator("tr", { hasText: `@${username}` });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("(not listed — approving adds it)");
  await expect(row).toContainText(`code ${NEW_CODE} · Gahogo, Kavumu · Government-aided · Boarding`);

  const approve = row.getByRole("button", { name: "Approve" });
  await expect(approve).toBeEnabled();
  await approve.click();
  const dialog = page.getByTestId("teacher-approve-dialog");
  await expect(dialog.getByTestId("approve-creates-school")).toContainText(SCHOOL_NAME);
  await expect(dialog.getByTestId("approve-creates-school")).toContainText(`code ${NEW_CODE}`);
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const out = await withDb(async (c) => ({
    school: (await c.query(
      `SELECT name, code, province, district, sector, cell, village, ownership::text AS ownership, accommodation::text AS accommodation
         FROM "School" WHERE code = $1`, [NEW_CODE])).rows,
    account: (await c.query(
      `SELECT u."accountStatus"::text AS state, s.code FROM "User" u
         JOIN "TeacherSchoolAssignment" a ON a."teacherId" = u.id AND a."isActive" JOIN "School" s ON s.id = a."schoolId"
        WHERE u.username = $1`, [username])).rows,
    status: (await c.query(`SELECT status::text AS s FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0].s,
  }));
  expect(out.status).toBe("APPROVED");
  expect(out.school).toEqual([{
    name: SCHOOL_NAME, code: NEW_CODE, province: PLACE.province, district: PLACE.district, sector: PLACE.sector,
    cell: "Gahogo", village: "Kavumu", ownership: "GOVERNMENT_AIDED", accommodation: "BOARDING",
  }]);
  expect(out.account).toEqual([{ state: "ACTIVE", code: NEW_CODE }]);
});
