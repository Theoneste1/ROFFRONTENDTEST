/**
 * The registration forms are one continuous form (app/components/forms/SignupForm, lib/forms/registration-fields,
 * app/components/shell/AuthShell): at 1366×768, 1280×720, 640×800 (two columns), 375×667 and 360×640 (one column), for the
 * Student, Teacher and Coach forms — empty, with every error shown, filled, and with "My school is not listed" — nothing
 * scrolls sideways, no part of the card has a scrollbar (the page scrolls as one), every field, label, message and button
 * is inside the window's width and nothing overlaps; fields pair two per row on wider windows. A form sent from the
 * narrowest and the 1280×720 window is stored as before (without a picture: it is optional). Crossing 640px keeps every
 * answer, error and the focus. The ROF LMS mark goes to the home page. The profile picture is a drop zone: a dropped
 * file is checked with the same rules and sent with the form. Against the real backend; synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { fillForm, layoutProblems, rowOf } from "../support/signup-layout";

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

/** A 1×1 PNG, and a file dropped on the picture's drop zone the way a browser does (a DataTransfer holding the file). */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
async function dropFile(page: Page, file: { name: string; type: string; base64: string }) {
  const zone = page.locator('[data-testid="signup-fields"] [data-testid="avatar-drop-zone"]');
  const dataTransfer = await page.evaluateHandle((f) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    return dt;
  }, file);
  await zone.dispatchEvent("dragenter", { dataTransfer });
  await zone.dispatchEvent("dragover", { dataTransfer });
  await zone.dispatchEvent("drop", { dataTransfer });
}

const FORMS = [
  { key: "student", path: "/register", submit: "Create my account", done: "register-done" },
  // A listed school's teacher: the account at once, signed in, on the teacher portal (owner 2026-11-21).
  { key: "teacher", path: "/register/teacher", submit: "Apply as a teacher", done: "teacher-portal" },
  { key: "coach", path: "/apply", submit: "Apply as a coach", done: "apply-done" },
] as const;

async function expectFits(page: Page, what: string) {
  expect(await layoutProblems(page), `${what}: fits the window`).toEqual([]);
}

/** Send with what is there: the form's own messages are shown on their fields (nothing is sent). */
async function showErrors(page: Page, submit: string) {
  await page.getByRole("button", { name: submit }).click();
  await expect(page.locator('[data-testid="signup-fields"] [aria-invalid="true"]').first()).toBeAttached({ timeout: 10_000 });
}

/** Send and wait for the confirmation (registration allows 10 requests a minute per address: a 429 waits it out). */
async function submitAndExpect(page: Page, button: string, doneTestId: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: button }).click();
    const outcome = await Promise.race([
      (doneTestId === "teacher-portal" ? page.waitForURL((u) => /^\/teacher(\/|$)/.test(u.pathname), { timeout: 30_000 }) : page.getByTestId(doneTestId).waitFor({ timeout: 30_000 }))
        .then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") break;
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
  if (doneTestId === "teacher-portal") await page.waitForURL((u) => /^\/teacher(\/|$)/.test(u.pathname), { timeout: 30_000 });
  else await expect(page.getByTestId(doneTestId)).toBeVisible({ timeout: 30_000 });
}

test.describe("the registration forms: one continuous form that fits every window", () => {
  for (const form of FORMS)
    for (const vp of VIEWPORTS) {
      const size = `${vp.width}x${vp.height}`;
      test(`${form.key} at ${vp.width}×${vp.height}: fits empty, with its errors, filled and with a school not listed; two per row on wide windows`, async ({ page }) => {
        test.setTimeout(240_000);
        const wide = vp.width >= 640;
        const username = `fit.${form.key}.${size.replace("x", "_")}.${RUN}`;
        const who = { username, lastName: `Fit${RUN}`, password: PASSWORD };
        await page.setViewportSize(vp);
        await page.goto(form.path);
        await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
        await expect(page.getByTestId("form-wizard")).toHaveCount(0);
        await expect(page.getByTestId("wizard-progress")).toHaveCount(0);
        const label = `${form.key} ${size}`;
        await expectFits(page, `${label}, empty`);

        // First and last name side by side on wide windows; one under the other on phones.
        const names = await rowOf(page, 'input[name="firstName"]', 'input[name="lastName"]');
        if (wide) {
          expect(names.a, `${label}: names on one row`).toBe(names.b);
          expect(names.bLeft).toBeGreaterThan(names.aLeft);
        } else {
          expect(names.b, `${label}: last name under the first`).toBeGreaterThan(names.a);
          expect(names.bLeft).toBe(names.aLeft);
        }

        await showErrors(page, form.submit);
        await expectFits(page, `${label}, with its errors`);
        await expect(page.getByTestId(form.done)).toHaveCount(0);
        await fillForm(page, who);
        await expectFits(page, `${label}, filled`);

        // "My school is not listed": its name field (and note) fit too, with its error; then the listed school again.
        const school = page.locator('[data-testid="signup-fields"] [data-testid="cascade-school"]');
        if (await school.count()) {
          await school.selectOption({ label: "My school is not listed" });
          const name = page.locator('[data-testid="signup-fields"] :is(input[name="proposedSchoolName"], input[name="schoolName"])');
          await expect(name).toBeVisible();
          await expectFits(page, `${label}, school not listed`);
          await showErrors(page, form.submit);
          await expect(name).toHaveAttribute("aria-invalid", "true");
          await expect(name).toBeFocused();
          await expectFits(page, `${label}, school not listed, with its error`);
          await school.selectOption({ index: 1 });
          await expectFits(page, `${label}, listed school again`);
        }
        await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
        await expect(page.locator('input[name="new-password"]')).toHaveValue(PASSWORD);

        if (!SEND_AT.has(size)) return;
        await submitAndExpect(page, form.submit, form.done);
        if (form.key === "teacher") {
          const row = await withDb(async (c) => (await c.query(
            `SELECT status::text AS status, "firstName", phone, position, "homeDistrict", "schoolId" IS NOT NULL AS school, "olympiadInterests"::text AS interests, "avatarFileId" IS NULL AS no_picture
               FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "APPROVED", firstName: "Aline", phone: expect.stringContaining("788123456"), position: "Mathematics teacher", homeDistrict: "Gasabo", school: true, no_picture: true });
          expect(row.interests).toContain("MATHEMATICS");
        } else if (form.key === "coach") {
          const row = await withDb(async (c) => (await c.query(
            `SELECT status::text AS status, occupation, "educationLevel"::text AS education, country, expertise, "relevantExperience", "olympiadInterests"::text AS interests, "avatarFileId" IS NULL AS no_picture
               FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "PENDING", occupation: "Engineer", education: "BACHELOR", country: "RW", expertise: "Algebra", relevantExperience: "Took part in a national Olympiad", no_picture: true });
          expect(row.interests).toContain("MATHEMATICS");
        } else {
          const row = await withDb(async (c) => (await c.query(
            `SELECT role::text AS role, to_char("dateOfBirth", 'YYYY-MM-DD') AS dob, "guardianPhone", "gradeLevel"::text AS grade, "olympiadInterests"::text AS interests, "avatarFileId" IS NULL AS no_picture
               FROM "User" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ role: "STUDENT", dob: "2011-06-15", guardianPhone: expect.stringContaining("788123456"), grade: "S2", no_picture: true });
          expect(row.interests).toContain("MATHEMATICS");
        }
      });
    }

  test("crossing 640px keeps every answer, every error and the focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Aline");
    await page.locator('input[name="lastName"]').fill(`Turn${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    await page.getByTestId("home-country").focus();

    // A phone held upright: one column, the same field focused, its answers and errors still there.
    await page.setViewportSize({ width: 375, height: 667 });
    await expect.poll(async () => { const r = await rowOf(page, 'input[name="firstName"]', 'input[name="lastName"]'); return r.b > r.a; }).toBe(true);
    await expect(page.getByTestId("home-country")).toBeFocused();
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="lastName"]')).toHaveValue(`Turn${RUN}`);
    expect(await layoutProblems(page)).toEqual([]);

    // Turned back: two columns again, nothing lost.
    await page.locator('input[name="guardianPhone"]').fill("0788123456");
    await page.locator('input[name="guardianPhone"]').focus();
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect.poll(async () => { const r = await rowOf(page, 'input[name="firstName"]', 'input[name="lastName"]'); return r.b === r.a; }).toBe(true);
    await expect(page.locator('input[name="guardianPhone"]')).toBeFocused();
    await expect(page.locator('input[name="guardianPhone"]')).toHaveValue("0788123456");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveAttribute("aria-invalid", "true");
    expect(await layoutProblems(page)).toEqual([]);
  });

  test("the ROF LMS mark goes to the home page (every form, wide and phone)", async ({ page }) => {
    for (const vp of [{ width: 1366, height: 768 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(vp);
      for (const form of FORMS) {
        await page.goto(form.path);
        await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
        const home = page.getByTestId("auth-brand-home").filter({ visible: true });
        await expect(home).toHaveCount(1);
        await home.click();
        await page.waitForURL((u) => u.pathname === "/");
      }
    }
  });

  test("the picture's drop zone takes a dropped file with the same rules; a student sent with a dropped picture has it", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1366, height: 768 });
    const username = `fit.drop.${RUN}`;
    const who = { username, lastName: `Drop${RUN}`, password: PASSWORD };
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    const zone = page.locator('[data-testid="signup-fields"] [data-testid="avatar-drop-zone"]');
    await expect(zone).toContainText("Click to upload or drag and drop");
    await expect(zone).toContainText("JPEG, PNG or WebP (max 2 MB)");

    // A file of another type: the existing message; sending stays on the form, focus on the picture, nothing sent.
    await dropFile(page, { name: "notes.txt", type: "text/plain", base64: "bm90IGEgcGljdHVyZQ==" });
    await expect(page.getByTestId("optional-avatar")).toContainText("Use a JPEG, PNG or WebP picture.");
    await fillForm(page, who);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.locator('input[name="avatar"]')).toBeFocused();
    await expect(page.getByTestId("register-done")).toHaveCount(0);
    expect(await layoutProblems(page), "with the picture's error").toEqual([]);

    // A picture: chosen, the error gone; it can be removed and dropped again.
    await dropFile(page, { name: "drop.png", type: "image/png", base64: PNG_B64 });
    await expect(page.getByTestId("optional-avatar")).toContainText("Chosen: drop.png.");
    await expect(page.getByTestId("optional-avatar")).not.toContainText("Use a JPEG");
    await page.getByRole("button", { name: "Remove the chosen picture" }).click();
    await expect(zone).toContainText("Click to upload or drag and drop");
    await dropFile(page, { name: "drop.png", type: "image/png", base64: PNG_B64 });
    await expect(zone).toContainText("drop.png");
    expect(await layoutProblems(page), "with a dropped picture").toEqual([]);

    // Sent: the dropped picture is the new account's picture.
    await submitAndExpect(page, "Create my account", "register-done");
    await expect(page.getByTestId("picture-outcome")).toBeVisible();
    const picture = await withDb(async (c) => (await c.query(`SELECT "avatarFileId" IS NOT NULL AS p FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(picture).toEqual({ p: true });
  });
});
