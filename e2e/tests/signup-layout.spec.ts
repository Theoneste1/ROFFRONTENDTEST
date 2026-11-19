/**
 * The registration forms fit the window, one step at a time (app/components/forms/FormWizard, lib/forms/registration-steps,
 * app/components/shell/AuthShell): at 1366×768, 1280×720 (two columns), 640×800, 375×667 and 360×640 (one column, more
 * steps), on every step of the Student, Teacher and Coach forms — empty, with the step's errors shown, and filled — the
 * page does not scroll, no part of the card has a scrollbar, every field, label, message and button is inside the window
 * and nothing overlaps; the wide layout's buttons are not stretched. Back and Next keep every answer; a form sent from
 * the narrowest and the 1280×720 window is stored as before. Crossing 640px keeps the person on the field they were on.
 * Against the real backend; synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { buttonProblems, fillShownStep, layoutProblems, stepOf } from "../support/signup-layout";

const RUN = Date.now().toString(36);
const PASSWORD = "Sign-Up-Pass-2026!";

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 640, height: 800 },
  { width: 375, height: 667 },
  { width: 360, height: 640 },
];
/** Where a whole form is sent (one wide and one narrow window). */
const SEND_AT = new Set(["1280x720", "360x640"]);

const FORMS = [
  { key: "student", path: "/register", ready: 'input[name="firstName"]', submit: "Create my account", done: "register-done" },
  { key: "teacher", path: "/register/teacher", ready: '[data-testid="teacher-register-form"]', submit: "Apply as a teacher", done: "teacher-register-done" },
  { key: "coach", path: "/apply", ready: '[data-testid="coach-country"]', submit: "Apply as a coach", done: "apply-done" },
] as const;

async function expectFits(page: Page, wide: boolean, what: string) {
  expect(await layoutProblems(page), `${what}: fits the window`).toEqual([]);
  if (wide) expect(await buttonProblems(page), `${what}: buttons not stretched`).toEqual([]);
}

/** Next on the step as it is: its errors are shown (a step with only optional fields moves on: then Back). */
async function showStepErrors(page: Page) {
  const before = await stepOf(page);
  await page.getByTestId(before.step === before.count ? "wizard-submit" : "wizard-next").click();
  const invalid = page.locator('[data-testid="wizard-fields"] [data-shown] [aria-invalid="true"]');
  await expect
    .poll(async () => (await invalid.count()) > 0 || (await stepOf(page)).step !== before.step, { timeout: 10_000 })
    .toBe(true);
  if ((await stepOf(page)).step !== before.step) {
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("wizard-progress")).toContainText(`Step ${before.step} of`);
    return false;
  }
  return true;
}

/** Send and wait for the confirmation (registration allows 10 requests a minute per address: a 429 waits it out). */
async function submitAndExpect(page: Page, button: string, doneTestId: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: button }).click();
    const outcome = await Promise.race([
      page.getByTestId(doneTestId).waitFor({ timeout: 30_000 }).then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") break;
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
  await expect(page.getByTestId(doneTestId)).toBeVisible({ timeout: 30_000 });
}

test.describe("the registration forms fit the window", () => {
  for (const form of FORMS)
    for (const vp of VIEWPORTS) {
      const size = `${vp.width}x${vp.height}`;
      test(`${form.key} at ${vp.width}×${vp.height}: every step fits, empty, with errors and filled; Back and Next keep the answers`, async ({ page }) => {
        test.setTimeout(240_000);
        const wide = vp.width > 640;
        const username = `fit.${form.key}.${size.replace("x", "_")}.${RUN}`;
        const who = { username, lastName: `Fit${RUN}`, password: PASSWORD };
        await page.setViewportSize(vp);
        await page.goto(form.path);
        // Attached: the coach's country is on the second step on phones (it is there once the backend's details are known).
        await page.locator(form.ready).first().waitFor({ state: "attached", timeout: 60_000 });
        await expect(page.getByTestId("form-wizard")).toHaveAttribute("data-layout", wide ? "wide" : "narrow");

        const { count } = await stepOf(page);
        const titles: string[] = [];
        for (let i = 1; i <= count; i++) {
          const at = await stepOf(page);
          expect(at.step).toBe(i);
          titles.push(at.title);
          const label = `${form.key} ${size} step ${i} "${at.title}"`;
          await expectFits(page, wide, `${label}, empty`);
          if (await showStepErrors(page)) await expectFits(page, wide, `${label}, with its errors`);
          await fillShownStep(page, who);
          await expectFits(page, wide, `${label}, filled`);
          // The school step: "My school is not listed" (its name field and note) fits too, with its error; then the listed school again.
          const school = page.locator('[data-testid="wizard-fields"] [data-shown] [data-testid="cascade-school"]');
          if (await school.count()) {
            await school.selectOption({ label: "My school is not listed" });
            await expectFits(page, wide, `${label}, school not listed`);
            // The name of the school: on this step, or on the next one (phones).
            const name = page.locator('[data-testid="wizard-fields"] [data-shown] :is(input[name="proposedSchoolName"], input[name="schoolName"])');
            const later = (await name.count()) === 0;
            if (later) {
              await page.getByTestId("wizard-next").click();
              await expect(name).toBeVisible();
              await expectFits(page, wide, `${label}, the not-listed school's name`);
            }
            if (await showStepErrors(page)) await expectFits(page, wide, `${label}, school not listed, with its errors`);
            if (later) await page.getByTestId("wizard-back").click();
            await school.selectOption({ index: 1 });
            await expectFits(page, wide, `${label}, listed school again`);
          }
          if (i < count) {
            await page.getByTestId("wizard-next").click();
            await expect(page.getByTestId("wizard-progress")).toContainText(`Step ${i + 1} of ${count}`);
          }
        }
        // The last step: Back, and the form's own submit label (no Next).
        await expect(page.getByRole("button", { name: form.submit })).toBeVisible();
        await expect(page.getByTestId("wizard-next")).toHaveCount(0);
        if (wide) await expect(page.getByTestId("wizard-back")).toBeVisible();

        // Back to the first step and forward again: every answer is still there, nothing to fill again.
        for (let i = count; i > 1; i--) await page.getByTestId("wizard-back").click();
        await expect(page.getByTestId("wizard-progress")).toContainText(`Step 1 of ${count}`);
        await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
        for (let i = 1; i < count; i++) {
          await page.getByTestId("wizard-next").click();
          await expect(page.getByTestId("wizard-progress")).toContainText(`Step ${i + 1} of ${count} · ${titles[i]}`);
        }
        await expect(page.locator('input[name="new-password"]')).toHaveValue(PASSWORD);

        if (!SEND_AT.has(size)) return;
        await submitAndExpect(page, form.submit, form.done);
        if (form.key === "teacher") {
          const row = await withDb(async (c) => (await c.query(
            `SELECT status::text AS status, "firstName", phone, position, "homeDistrict", "schoolId" IS NOT NULL AS school, "olympiadInterests"::text AS interests
               FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "PENDING", firstName: "Aline", phone: expect.stringContaining("788123456"), position: "Mathematics teacher", homeDistrict: "Gasabo", school: true });
          expect(row.interests).toContain("MATHEMATICS");
        } else if (form.key === "coach") {
          const row = await withDb(async (c) => (await c.query(
            `SELECT status::text AS status, occupation, "educationLevel"::text AS education, country, expertise, "relevantExperience", "olympiadInterests"::text AS interests
               FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "PENDING", occupation: "Engineer", education: "BACHELOR", country: "RW", expertise: "Combinatorics", relevantExperience: "Three years coaching olympiad teams." });
          expect(row.interests).toContain("MATHEMATICS");
        } else {
          const row = await withDb(async (c) => (await c.query(
            `SELECT role::text AS role, to_char("dateOfBirth", 'YYYY-MM-DD') AS dob, "guardianPhone", "gradeLevel"::text AS grade, "olympiadInterests"::text AS interests
               FROM "User" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ role: "STUDENT", dob: "2011-06-15", guardianPhone: expect.stringContaining("788123456"), grade: "S2" });
          expect(row.interests).toContain("MATHEMATICS");
        }
      });
    }

  test("crossing 640px keeps the person on the field they were on, with every answer and error", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(page.getByTestId("form-wizard")).toHaveAttribute("data-layout", "wide");
    await page.locator('input[name="firstName"]').fill("Aline");
    await page.locator('input[name="lastName"]').fill(`Turn${RUN}`);
    // The step's errors (date of birth, country), then the person is on the country.
    await page.getByTestId("wizard-next").click();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    await page.getByTestId("home-country").focus();

    // A phone held upright: the narrow step holding that field, the field still focused, its error still shown.
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByTestId("form-wizard")).toHaveAttribute("data-layout", "narrow");
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 2 of 11 · Birth and country");
    await expect(page.getByTestId("home-country")).toBeVisible();
    await expect(page.getByTestId("home-country")).toBeFocused();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    expect(await layoutProblems(page)).toEqual([]);
    // Back: the names typed on the wide step are there.
    await page.getByTestId("wizard-back").click();
    await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
    await page.locator('input[name="lastName"]').focus();

    // Turned back: the wide step holding the last name, with the errors of that step still shown.
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId("form-wizard")).toHaveAttribute("data-layout", "wide");
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 1 of 7 · About you");
    await expect(page.locator('input[name="lastName"]')).toHaveValue(`Turn${RUN}`);
    await expect(page.locator('input[name="lastName"]')).toBeFocused();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    expect(await layoutProblems(page)).toEqual([]);

    // On to the second wide step; the person is on the close-family phone (the second field of its narrow step).
    await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
    await page.getByTestId("home-country").selectOption("RW");
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 2 of 7 · Phone and picture");
    await page.locator('input[name="guardianPhone"]').fill("0788123456");
    await page.setViewportSize({ width: 360, height: 640 });
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 3 of 11 · Phone numbers");
    await expect(page.locator('input[name="guardianPhone"]')).toBeFocused();
    await expect(page.locator('input[name="guardianPhone"]')).toHaveValue("0788123456");
    expect(await layoutProblems(page)).toEqual([]);
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 2 of 7 · Phone and picture");
    await expect(page.locator('input[name="guardianPhone"]')).toBeFocused();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("2011-06-15");
  });
});
