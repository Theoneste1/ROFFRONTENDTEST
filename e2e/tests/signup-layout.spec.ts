/**
 * The registration forms fit the window, one step at a time (app/components/forms/FormWizard, lib/forms/registration-steps,
 * app/components/shell/AuthShell): at 1366×768, 1280×720 (two columns), 640×800, 375×667 and 360×640 (one column, more
 * steps), on every step of the Student, Teacher and Coach forms — empty, with the step's errors shown, and filled — the
 * page does not scroll, no part of the card has a scrollbar, every field, label, message and button is inside the window
 * and nothing overlaps; the wide layout's buttons are not stretched. Back and Next keep every answer; a form sent from
 * the narrowest and the 1280×720 window is stored as before (without a picture: it is optional). Crossing 640px keeps the
 * person on the field they were on.
 *
 * The approved reference design: the progress shows the form's named phases (the same at every size), the current one
 * marked; a phase of several screens says "2 of 3" beside the step heading. Cancel on the first step goes to the home
 * page. The profile picture is a drop zone: a dropped file is checked with the same rules and sent with the form.
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

/** The phases of each form, and the phase of each screen (by its heading), in both layouts. */
const PHASES = {
  student: ["About you", "Studies & school", "Home", "Account"],
  teacher: ["About you", "Teaching", "School & home", "Account"],
  coach: ["About you", "Background", "Account"],
} as const;
const PHASE_OF: Record<keyof typeof PHASES, Record<string, string>> = {
  student: {
    "About you": "About you", "Phone and picture": "About you", "Birth and country": "About you", "Phone numbers": "About you", "Profile picture": "About you",
    "Your studies": "Studies & school", "School location": "Studies & school", "School district and sector": "Studies & school", "Your school": "Studies & school",
    "Where you live": "Home", "Your account": "Account", "Your password": "Account",
  },
  teacher: {
    "About you": "About you", "Contact details": "About you", "Country": "About you",
    "Your teaching": "Teaching", "Olympiad interests": "Teaching", "Profile picture": "Teaching",
    "School location": "School & home", "School district and sector": "School & home", "Your school": "School & home", "School name": "School & home", "Home location": "School & home",
    "Your username": "Account", "Your password": "Account", "Your account": "Account",
  },
  coach: {
    "About you": "About you", "Country and phone": "About you", "Profile picture": "About you",
    "Your background": "Background", "Affiliation": "Background", "Olympiad subjects": "Background", "Your expertise": "Background", "Your experience": "Background",
    "Your account": "Account", "Your password": "Account",
  },
};

/** The phases shown (their visible names), the current one's name, and "2 of 3" (empty when the phase has one screen). */
async function phaseState(page: Page) {
  const steps = page.getByTestId("wizard-steps");
  const labels = await steps.locator("li").evaluateAll((els) => els.map((el) => (el.querySelector('[data-testid="wizard-phase-label"]')?.textContent ?? "").trim()));
  const current = steps.locator('li[aria-current="step"]');
  const count = await current.count();
  const currentTitle = count === 1 ? ((await current.locator('[data-testid="wizard-phase-label"]').textContent()) ?? "").trim() : "";
  const screen = (await page.getByTestId("wizard-screen").count()) ? ((await page.getByTestId("wizard-screen").textContent()) ?? "").trim() : "";
  return { labels, count, currentTitle, screen };
}

/** A 1×1 PNG, and a file dropped on the picture's drop zone the way a browser does (a DataTransfer holding the file). */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
async function dropFile(page: Page, file: { name: string; type: string; base64: string }) {
  const zone = page.locator('[data-testid="wizard-fields"] [data-shown] [data-testid="avatar-drop-zone"]');
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
        const screens: string[] = [];
        for (let i = 1; i <= count; i++) {
          const at = await stepOf(page);
          expect(at.step).toBe(i);
          titles.push(at.title);
          const label = `${form.key} ${size} step ${i} "${at.title}"`;
          // The progress: the form's phases, one current, the screen's own; "2 of 3" inside a phase (checked below).
          const phases = await phaseState(page);
          expect(phases.labels, `${label}: the phases`).toEqual([...PHASES[form.key]]);
          expect(phases.count, `${label}: one current phase`).toBe(1);
          expect(phases.currentTitle, `${label}: its phase`).toBe(PHASE_OF[form.key][at.title]);
          screens.push(phases.screen);
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
        // "2 of 3": the screens of a phase are numbered in a row; a phase of one screen shows nothing.
        const phaseOfTitle = titles.map((t) => PHASE_OF[form.key][t]);
        const expectedScreens = phaseOfTitle.map((ph, i) => {
          const all = phaseOfTitle.filter((x) => x === ph).length;
          return all > 1 ? `${phaseOfTitle.slice(0, i + 1).filter((x) => x === ph).length} of ${all}` : "";
        });
        expect(screens, `${form.key} ${size}: "2 of 3" inside the phases`).toEqual(expectedScreens);
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
            `SELECT status::text AS status, "firstName", phone, position, "homeDistrict", "schoolId" IS NOT NULL AS school, "olympiadInterests"::text AS interests, "avatarFileId" IS NULL AS no_picture
               FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "PENDING", firstName: "Aline", phone: expect.stringContaining("788123456"), position: "Mathematics teacher", homeDistrict: "Gasabo", school: true, no_picture: true });
          expect(row.interests).toContain("MATHEMATICS");
        } else if (form.key === "coach") {
          const row = await withDb(async (c) => (await c.query(
            `SELECT status::text AS status, occupation, "educationLevel"::text AS education, country, expertise, "relevantExperience", "olympiadInterests"::text AS interests, "avatarFileId" IS NULL AS no_picture
               FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);
          expect(row).toMatchObject({ status: "PENDING", occupation: "Engineer", education: "BACHELOR", country: "RW", expertise: "Combinatorics", relevantExperience: "Three years coaching olympiad teams.", no_picture: true });
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

  test("Cancel on the first step goes to the home page (every form); later steps have Back instead", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const form of FORMS) {
      await page.goto(form.path);
      await page.locator(form.ready).first().waitFor({ state: "attached", timeout: 60_000 });
      await expect(page.getByTestId("wizard-back")).toHaveCount(0);
      const cancel = page.getByRole("link", { name: "Cancel", exact: true });
      await expect(cancel).toBeVisible();
      await cancel.click();
      await page.waitForURL((u) => u.pathname === "/");
    }
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await fillShownStep(page, { username: `cancel.${RUN}`, lastName: `Cancel${RUN}`, password: PASSWORD });
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-progress")).toContainText("Step 2 of");
    await expect(page.getByTestId("wizard-cancel")).toHaveCount(0);
    await expect(page.getByTestId("wizard-back")).toBeVisible();
  });

  test("the picture's drop zone takes a dropped file with the same rules; a student sent with a dropped picture has it", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1366, height: 768 });
    const username = `fit.drop.${RUN}`;
    const who = { username, lastName: `Drop${RUN}`, password: PASSWORD };
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await fillShownStep(page, who);
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-progress")).toContainText("Phone and picture");
    await expect(page.getByTestId("wizard-screen")).toHaveText("2 of 2");
    const zone = page.locator('[data-testid="wizard-fields"] [data-shown] [data-testid="avatar-drop-zone"]');
    await expect(zone).toContainText("Click to upload or drag and drop");
    await expect(zone).toContainText("JPEG, PNG or WebP (max 2 MB)");

    // A file of another type: the existing message, and Next stays on the step (the picture's own rule).
    await dropFile(page, { name: "notes.txt", type: "text/plain", base64: "bm90IGEgcGljdHVyZQ==" });
    await expect(page.getByTestId("optional-avatar")).toContainText("Use a JPEG, PNG or WebP picture.");
    await fillShownStep(page, who);
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-progress")).toContainText("Phone and picture");
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
    expect(await buttonProblems(page)).toEqual([]);

    // The rest of the form, then sent: the dropped picture is the new account's picture.
    for (let guard = 0; guard < 12 && (await page.getByTestId("wizard-next").count()); guard++) {
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("wizard-progress")).toContainText(`Step ${guard + 3} of`);
      await fillShownStep(page, who);
    }
    await submitAndExpect(page, "Create my account", "register-done");
    await expect(page.getByTestId("picture-outcome")).toBeVisible();
    const picture = await withDb(async (c) => (await c.query(`SELECT "avatarFileId" IS NOT NULL AS p FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(picture).toEqual({ p: true });
  });
});
