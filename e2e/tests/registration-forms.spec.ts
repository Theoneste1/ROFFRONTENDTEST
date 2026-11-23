/**
 * The public sign-up forms in the browser (REG-02, REG-05, REG-06, REG-08, UX-01): a student registers with and without
 * the optional profile picture, a teacher and a coach apply, and a closed form shows its closed message instead of the
 * form. Each account is checked in the database afterwards. Synthetic data only; usernames are unique per run.
 * The forms are one continuous form: every field is filled, then the form is sent.
 */
import { expect, request, test, type Page } from "@playwright/test";
import { pickCountry } from "../support/signup-layout";
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

/**
 * Submit and wait for the confirmation. Registration endpoints allow 10 requests a minute per address (not weakened for
 * tests); in a full run other specs may have used them, so a "Too many requests" answer waits out the window and submits
 * again, as the sign-in helper does.
 */
async function submitAndExpect(page: Page, button: string, doneTestId: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: button }).click();
    const outcome = await Promise.race([
      page.getByTestId(doneTestId).waitFor({ timeout: 30_000 }).then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") break;
    test.info().annotations.push({ type: "rate-limit", description: `${button}: 429, waited 61 s` });
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
  await expect(page.getByTestId(doneTestId)).toBeVisible({ timeout: 30_000 });
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
  await page.locator('input[name="gender"][value="FEMALE"]').check();
  await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
  await pickCountry(page, "home-country", "Rwanda");
  if (withPicture) await page.locator('input[name="avatar"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
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
  await submitAndExpect(page, "Create my account", "register-done");
}

test.describe("public sign-up forms", () => {
  test("a student registers without a picture (it is optional); the account is stored with date of birth and guardian phone", async ({ page }) => {
    const username = `signup.nopic.${RUN}`;
    await studentForm(page, username, false);
    const row = await withDb(async (c) => (await c.query(
      `SELECT role, to_char("dateOfBirth", 'YYYY-MM-DD') AS dob, "guardianPhone" IS NOT NULL AS guardian, "avatarFileId" IS NULL AS no_picture, "olympiadInterests"::text AS interests
         FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(row).toMatchObject({ role: "STUDENT", dob: "2011-06-15", guardian: true, no_picture: true });
    expect(row.interests).toContain("MATHEMATICS");
  });

  test("a student registers with a picture; the picture is attached to the new account", async ({ page }) => {
    const username = `signup.pic.${RUN}`;
    await studentForm(page, username, true);
    await expect(page.getByTestId("picture-outcome")).toBeVisible();
    const hasPicture = await withDb(async (c) => (await c.query(`SELECT "avatarFileId" IS NOT NULL AS p FROM "User" WHERE username = $1`, [username])).rows[0].p);
    expect(hasPicture).toBe(true);
  });

  test("a teacher of a listed school registers: the account at once, signed in, on the teacher dashboard (owner 2026-11-21)", async ({ page }) => {
    const username = `signup.teacher.${RUN}`;
    await page.goto("/register/teacher");
    const form = page.getByTestId("teacher-register-form");
    await form.waitFor({ timeout: 60_000 });
    await form.locator('input[name="firstName"]').fill("Jean");
    await form.locator('input[name="lastName"]').fill(`Teacher${RUN}`);
    await form.locator('input[name="gender"][value="FEMALE"]').check();
    await form.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await pickCountry(page, "home-country", "Rwanda");
    await form.locator('input[name="phone"]').fill("0788654321");
    // Position: a dropdown; "Other" shows a text box for a position that is not listed. Years: a dropdown (optional).
    await form.locator('select[name="position"]').selectOption("__other__");
    await form.locator('input[name="position"]').fill("Olympiad club coordinator");
    await form.locator('select[name="yearsOfExperience"]').selectOption("5");
    await form.getByLabel("Mathematics").check();
    const schoolCountry = page.getByTestId("teacher-school-country");
    if (await schoolCountry.isEnabled()) await schoolCountry.selectOption("RW");   // Rwanda only: preselected and fixed
    else await expect(schoolCountry).toHaveValue("RW");
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await selectWhenReady(page, "home-province", "Kigali City");
    await selectWhenReady(page, "home-district", "Gasabo");
    const homeSector = page.getByTestId("home-sector");
    await expect(homeSector).toBeEnabled();
    await homeSector.selectOption({ index: 1 });
    await form.locator('input[name="username"]').fill(username);
    await fillPassword(page);
    await page.getByRole("button", { name: "Apply as a teacher" }).click();
    // No Administrator: signed in and taken to the teacher portal.
    await page.waitForURL((u) => /^\/teacher(\/|$)/.test(u.pathname), { timeout: 60_000 });
    const row = await withDb(async (c) => ({
      ...(await c.query(`SELECT status::text AS status, position, "yearsOfExperience" AS years FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0],
      account: (await c.query(
        `SELECT u.role::text AS role, u."accountStatus"::text AS state, s.name AS school
           FROM "User" u JOIN "TeacherSchoolAssignment" a ON a."teacherId" = u.id AND a."isActive" JOIN "School" s ON s.id = a."schoolId"
          WHERE u.username = $1`, [username])).rows,
    }));
    expect(row).toEqual({ status: "APPROVED", position: "Olympiad club coordinator", years: 5, account: [{ role: "TEACHER", state: "ACTIVE", school: SCHOOL.name }] });
  });

  test("a coach applies; the request waits for an administrator", async ({ page }) => {
    const username = `signup.coach.${RUN}`;
    await page.goto("/apply");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Claude");
    await page.locator('input[name="lastName"]').fill(`Coach${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await pickCountry(page, "coach-country", "Rwanda");
    // Home in Rwanda: province → district → sector.
    await selectWhenReady(page, "home-province", "Kigali City");
    await selectWhenReady(page, "home-district", "Gasabo");
    await expect(page.getByTestId("home-sector")).toBeEnabled();
    await page.getByTestId("home-sector").selectOption({ index: 1 });
    await page.locator('input[name="phone"]').fill("0788111222");
    await page.locator('select[name="occupation"]').selectOption("Engineer");
    await page.getByTestId("coach-education").selectOption("BACHELOR");
    await page.getByTestId("olympiad-interests").getByLabel("Physics").check();
    // "Other" Olympiad (olympiadInterestOther): ticked, it asks which one.
    await page.getByTestId("olympiad-interest-other-toggle").check();
    await page.locator('input[name="olympiadInterestOther"]').fill("Chemistry");
    // Tick lists with "Other" (sent as readable text).
    const expertise = page.getByTestId("expertise-choices");
    await expertise.getByLabel("Mechanics", { exact: true }).check();
    await expertise.getByLabel("Optics and waves").check();
    await expertise.locator('input[name="expertiseOtherOn"]').check();
    await expertise.locator('input[name="expertiseOther"]').fill("Olympiad problem solving");
    await page.getByTestId("relevantExperience-choices").getByLabel("Coached or trained Olympiad students").check();
    await page.locator('select[name="yearsOfExperience"]').selectOption("3");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await fillPassword(page);
    await submitAndExpect(page, "Apply as a coach", "apply-done");
    // The confirmation (owner 2026-11-22): pending review by the Head Coach or an administrator; no need to send it again.
    await expect(page.getByTestId("apply-done-title")).toHaveText("Thank you for submitting your application!");
    await expect(page.getByTestId("apply-done-message").locator("p")).toHaveText([
      "Your application has been received and is awaiting review by the ROF Head Coach or an administrator. Please wait for the " +
        "review process to be completed. We will get back to you with an update.",
      "There is no need to submit the application again.",
    ]);
    await expect(page.getByTestId("apply-done").getByRole("link", { name: "Back to the homepage" })).toBeVisible();
    const row = await withDb(async (c) => (await c.query(
      `SELECT status::text AS status, "yearsOfExperience" AS years, occupation, expertise, "relevantExperience" AS experience,
              "olympiadInterests"::text AS interests, "olympiadInterestOther" AS other FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);
    expect(row).toEqual({
      status: "PENDING", years: 3, occupation: "Engineer", expertise: "Mechanics; Optics and waves; Other: Olympiad problem solving",
      experience: "Coached or trained Olympiad students", interests: "{PHYSICS}", other: "Chemistry",
    });
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
