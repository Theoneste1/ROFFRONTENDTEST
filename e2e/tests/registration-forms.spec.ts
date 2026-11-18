/**
 * The public sign-up forms in the browser (REG-02, REG-05, REG-06, REG-08, UX-01): a student registers with and without
 * the optional profile picture, a teacher and a coach apply, and a closed form shows its closed message instead of the
 * form. Each account is checked in the database afterwards. Synthetic data only; usernames are unique per run.
 */
import { expect, request, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { passwordOf } from "../support/accounts";

const RUN = Date.now().toString(36);
const PASSWORD = "Sign-Up-Pass-2026!";
// A school of the seeded directory with a full location (the cascades need province, district and sector).
const SCHOOL = { name: "ACEJ KARAMA", province: "Southern Province", district: "Muhanga", sector: "Muhanga" };
// 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function selectWhenReady(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  // Options may carry more than the name (schools: "NAME (CODE)"): choose the one that contains it.
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

/** Open or close a form the way an Administrator does (PATCH /admin/forms/:key/availability), so the backend's cache follows. */
async function setForm(key: string, mode: "OPEN" | "CLOSED") {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL ?? "http://127.0.0.1:4100" });
  try {
    const login = await api.post("/api/v1/auth/login", { data: { username: "admin", password: passwordOf("admin") } });
    expect(login.ok()).toBe(true);
    const token = (await login.json()).access_token as string;
    const r = await api.patch(`/api/v1/admin/forms/${key}/availability`, { data: { mode }, headers: { authorization: `Bearer ${token}` } });
    expect(r.ok(), await r.text()).toBe(true);
  } finally {
    await api.dispose();
  }
}

async function fillPassword(page: Page) {
  await page.locator('input[name="new-password"]').fill(PASSWORD);
  await page.locator('input[name="confirm-password"]').fill(PASSWORD);
}

async function studentForm(page: Page, username: string, withPicture: boolean) {
  await page.goto("/register");
  await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
  await page.locator('input[name="firstName"]').fill("Aline");
  await page.locator('input[name="lastName"]').fill(`Signup${RUN}`);
  await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
  if (withPicture) await page.locator('input[name="avatar"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await page.getByTestId("home-country").selectOption("RW");
  await page.locator('input[name="guardianPhone"]').fill("0788123456");
  await page.locator('select[name="gradeLevel"]').selectOption("S2");
  await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
  await page.getByTestId("cascade-country").selectOption("RW");
  await selectWhenReady(page, "cascade-province", SCHOOL.province);
  await selectWhenReady(page, "cascade-district", SCHOOL.district);
  await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
  await selectWhenReady(page, "cascade-school", SCHOOL.name);
  await selectWhenReady(page, "home-province", "Kigali City");
  await selectWhenReady(page, "home-district", "Gasabo");
  const sector = page.getByTestId("home-sector");
  await expect(sector).toBeEnabled();
  await sector.selectOption({ index: 1 });
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
  await fillPassword(page);
  await page.getByRole("button", { name: "Create my account" }).click();
}

test.describe("public sign-up forms", () => {
  test("a student registers without a picture (it is optional); the account is stored with date of birth and guardian phone", async ({ page }) => {
    const username = `signup.nopic.${RUN}`;
    await studentForm(page, username, false);
    await expect(page.getByTestId("register-done")).toBeVisible({ timeout: 30_000 });
    const row = await withDb(async (c) => (await c.query(
      `SELECT role, to_char("dateOfBirth", 'YYYY-MM-DD') AS dob, "guardianPhone" IS NOT NULL AS guardian, "avatarFileId" IS NULL AS no_picture, "olympiadInterests"::text AS interests
         FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(row).toMatchObject({ role: "STUDENT", dob: "2011-06-15", guardian: true, no_picture: true });
    expect(row.interests).toContain("MATHEMATICS");
  });

  test("a student registers with a picture; the picture is attached to the new account", async ({ page }) => {
    const username = `signup.pic.${RUN}`;
    await studentForm(page, username, true);
    await expect(page.getByTestId("register-done")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("picture-outcome")).toBeVisible();
    const hasPicture = await withDb(async (c) => (await c.query(`SELECT "avatarFileId" IS NOT NULL AS p FROM "User" WHERE username = $1`, [username])).rows[0].p);
    expect(hasPicture).toBe(true);
  });

  test("a teacher applies; the application waits for an administrator", async ({ page }) => {
    const username = `signup.teacher.${RUN}`;
    await page.goto("/register/teacher");
    const form = page.getByTestId("teacher-register-form");
    await form.waitFor({ timeout: 60_000 });
    await form.locator('input[name="firstName"]').fill("Jean");
    await form.locator('input[name="lastName"]').fill(`Teacher${RUN}`);
    await form.locator('input[name="username"]').fill(username);
    await form.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await form.getByLabel("Country *", { exact: true }).selectOption("RW");
    await form.locator('input[name="phone"]').fill("0788654321");
    await form.locator('input[name="position"]').fill("Mathematics teacher");
    await form.getByLabel("Mathematics").check();
    const schoolCountry = page.getByTestId("teacher-school-country");
    if (await schoolCountry.isEnabled()) await schoolCountry.selectOption("RW");   // Rwanda only: preselected and fixed
    else await expect(schoolCountry).toHaveValue("RW");
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    const homeDistrict = form.getByLabel("Home district *");
    await homeDistrict.selectOption({ label: "Gasabo" });   // the home province follows from the district
    const homeSector = form.getByLabel("Home sector *");
    await expect(homeSector).toBeEnabled();
    await homeSector.selectOption({ index: 1 });
    await fillPassword(page);
    await page.getByRole("button", { name: "Apply as a teacher" }).click();
    await expect(page.getByTestId("teacher-register-done")).toBeVisible({ timeout: 30_000 });
    // The application holds the details; no account exists until an Administrator approves it.
    const row = await withDb(async (c) => ({
      status: (await c.query(`SELECT status::text AS status FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0]?.status,
      accounts: Number((await c.query(`SELECT count(*) FROM "User" WHERE username = $1`, [username])).rows[0].count),
    }));
    expect(row).toEqual({ status: "PENDING", accounts: 0 });
  });

  test("a coach applies; the request waits for an administrator", async ({ page }) => {
    const username = `signup.coach.${RUN}`;
    await page.goto("/apply");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Claude");
    await page.locator('input[name="lastName"]').fill(`Coach${RUN}`);
    await page.getByTestId("coach-country").selectOption("RW");
    await page.locator('input[name="occupation"]').fill("Engineer");
    await page.getByTestId("coach-education").selectOption("BACHELOR");
    await page.getByTestId("olympiad-interests").getByLabel("Physics").check();
    await page.locator('input[name="phone"]').fill("0788111222");
    await page.locator('textarea[name="expertise"]').fill("Mechanics and olympiad problem solving.");
    await page.locator('textarea[name="relevantExperience"]').fill("Three years coaching national olympiad teams.");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await fillPassword(page);
    await page.getByRole("button", { name: "Apply as a coach" }).click();
    await expect(page.getByTestId("apply-done")).toBeVisible({ timeout: 30_000 });
    const status = await withDb(async (c) => (await c.query(`SELECT status::text AS status FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]?.status);
    expect(status).toBe("PENDING");
  });

  test("a closed form shows the closed message instead of the form (and opens again)", async ({ page }) => {
    await setForm("STUDENT_REGISTRATION", "CLOSED");
    try {
      await page.goto("/register");
      await expect(page.getByTestId("register-closed")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('input[name="firstName"]')).toHaveCount(0);
    } finally {
      await setForm("STUDENT_REGISTRATION", "OPEN");
    }
    await page.goto("/register");
    await expect(page.locator('input[name="firstName"]')).toBeVisible({ timeout: 30_000 });
  });
});
