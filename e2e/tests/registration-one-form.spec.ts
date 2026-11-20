/**
 * The registration forms as ONE continuous form (app/components/forms/SignupForm) in the browser: no steps, progress,
 * section headings, Next or Back — every field at once and one submit button; sending with missing answers shows every
 * message on its field and puts focus on the first highlighted field, keeping everything typed; a field the server
 * refuses gets the server's message and the focus; a refusal naming no field shows its message in view; the Student /
 * Teacher / Coach switch starts each form afresh; the page scrolls as one (nothing in the card has a scrollbar).
 * Against the real backend; synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";

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

/** Send the form; a "Too many requests" answer (10 registrations a minute per address) waits out the window and sends again. */
async function submitUntilAnswered(page: Page, button: string, answered: () => Promise<unknown>) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: button }).click();
    const outcome = await Promise.race([
      answered().then(() => "answered" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") return;
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
}

const live = (page: Page) => page.getByTestId("signup-live");

/** No step, progress, section heading, Next or Back: one form, one submit button. */
async function expectOneForm(page: Page, submit: string) {
  await expect(page.getByTestId("signup-form")).toBeVisible();
  for (const id of ["form-wizard", "wizard-steps", "wizard-progress", "wizard-next", "wizard-back", "wizard-cancel"]) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId("signup-form").locator("h2")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("signup-form").getByRole("button", { name: submit })).toHaveCount(1);
  // The first and the last fields are both in the page at once.
  await expect(page.locator('input[name="firstName"]')).toBeVisible();
  await expect(page.locator('input[name="confirm-password"]')).toBeVisible();
}

test.describe("registration forms, one continuous form", () => {
  test("student: every field at once; sending with missing answers shows each message on its field, focus on the first; nothing is lost", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expectOneForm(page, "Create my account");
    for (const name of ["firstName", "lastName", "dateOfBirth", "guardianPhone", "username", "email", "new-password", "confirm-password"])
      await expect(page.locator(`input[name="${name}"]`), name).toBeVisible();
    await expect(page.locator('select[name="gradeLevel"]')).toBeVisible();
    await expect(page.getByTestId("home-country")).toBeVisible();
    // Without section headings, the school's places say "School" (they are not the student's own country or province).
    await expect(page.getByLabel("School country *")).toBeVisible();
    await expect(page.getByLabel("School province *")).toBeVisible();

    // Sending with nothing filled: the existing messages, on their fields, all at once; focus on the first; nothing sent.
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByText("Enter your first name.")).toBeVisible();
    await expect(page.getByText("Choose your grade.")).toBeAttached();
    await expect(page.locator('input[name="username"]')).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="firstName"]')).toBeFocused();
    await expect(live(page)).toContainText("Please check the highlighted fields.");
    await expect(page.getByTestId("register-done")).toHaveCount(0);

    // Some answers: the next send puts focus on the first field still missing; what was typed stays.
    await page.locator('input[name="firstName"]').fill("Aline");
    await page.locator('input[name="lastName"]').fill(`OneForm${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
    await page.getByTestId("home-country").selectOption("RW");
    await page.locator('input[name="guardianPhone"]').fill("0788123456");
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.locator('select[name="gradeLevel"]')).toBeFocused();
    await expect(page.locator('select[name="gradeLevel"]')).toBeInViewport();
    await expect(page.getByText("Enter your first name.")).toHaveCount(0);
    await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("2011-06-15");
    await expect(page.locator('input[name="guardianPhone"]')).toHaveValue("0788123456");

    // The school: province → district → sector → school; "not listed" shows its name field in place, and goes again.
    await page.locator('select[name="gradeLevel"]').selectOption("S2");
    await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
    await page.getByTestId("cascade-country").selectOption("RW");
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await expect(page.locator('input[name="schoolName"]')).toHaveCount(0);
    await page.getByTestId("cascade-school").selectOption({ label: "My school is not listed" });
    await expect(page.locator('input[name="schoolName"]')).toBeVisible();
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await expect(page.locator('input[name="schoolName"]')).toHaveCount(0);
  });

  test("teacher: a field the server refuses gets the server's message and the focus; everything else stays", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `one.teacher.${RUN}`;
    await page.goto("/register/teacher");
    const form = page.getByTestId("teacher-register-form");
    await form.waitFor({ timeout: 60_000 });
    await expectOneForm(page, "Apply as a teacher");
    await form.locator('input[name="firstName"]').fill("Jean");
    await form.locator('input[name="lastName"]').fill(`OneForm${RUN}`);
    await form.locator('input[name="gender"][value="FEMALE"]').check();
    // Passes the form's own e-mail check; the server's stricter check refuses it.
    await form.locator('input[name="email"]').fill(`${username}@exa_mple.com`);
    await form.getByLabel("Country *", { exact: true }).selectOption("RW");
    await form.locator('input[name="phone"]').fill("0788654321");
    await form.locator('input[name="position"]').fill("Mathematics teacher");
    await form.getByLabel("Mathematics").check();
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await form.getByLabel("Home district *").selectOption({ label: "Gasabo" });
    await expect(form.getByLabel("Home sector *")).toBeEnabled();
    await form.getByLabel("Home sector *").selectOption({ index: 1 });
    await form.locator('input[name="username"]').fill(username);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    await submitUntilAnswered(page, "Apply as a teacher", () => expect(page.getByText("email must be an email")).toBeVisible({ timeout: 30_000 }));

    await expect(page.getByText("email must be an email")).toBeVisible();
    await expect(form.locator('input[name="email"]')).toBeFocused();
    await expect(form.locator('input[name="email"]')).toBeInViewport();
    await expect(live(page)).toContainText("Please check the highlighted fields.");
    // Everything else is still there.
    await expect(form.locator('input[name="phone"]')).toHaveValue("0788654321");
    await expect(form.locator('input[name="username"]')).toHaveValue(username);
    const applications = await withDb(async (c) => Number((await c.query(`SELECT count(*) FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0].count));
    expect(applications).toBe(0);
  });

  test("coach: Enter keeps new lines in a text area; a refusal naming no field shows its message in view", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/apply");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expectOneForm(page, "Apply as a coach");
    await page.locator('input[name="firstName"]').fill("Claude");
    await page.locator('input[name="lastName"]').fill(`OneForm${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await page.getByTestId("coach-country").selectOption("RW");
    await page.locator('input[name="phone"]').fill("0788111222");
    await page.locator('input[name="occupation"]').fill("Engineer");
    await page.getByTestId("coach-education").selectOption("BACHELOR");
    await page.getByTestId("olympiad-interests").getByLabel("Physics").check();
    const expertise = page.locator('textarea[name="expertise"]');
    await expertise.fill("Mechanics");
    await expertise.press("End");
    await expertise.press("Enter");
    await expertise.pressSequentially("Olympiad problem solving");
    await expect(expertise).toHaveValue("Mechanics\nOlympiad problem solving");
    await expect(page.getByTestId("apply-done")).toHaveCount(0);
    await page.locator('textarea[name="relevantExperience"]').fill("Three years coaching national olympiad teams.");
    // "admin" is taken: the backend refuses the application without naming a field.
    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="email"]').fill(`one.coach.${RUN}@e2e.local`);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    const taken = page.getByRole("alert").filter({ hasText: "That username or e-mail is already in use" });
    await submitUntilAnswered(page, "Apply as a coach", () => taken.waitFor({ timeout: 30_000 }));
    await expect(taken).toBeVisible();
    await expect(taken).toBeInViewport();
    await expect(page.getByTestId("apply-done")).toHaveCount(0);
    await expect(page.locator('input[name="occupation"]')).toHaveValue("Engineer");
  });

  test("the Student / Teacher / Coach switch shows each form afresh, with nothing carried over", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Aline");
    await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");

    await page.getByTestId("join-switch").getByRole("link", { name: "Coach" }).click();
    await expect(page).toHaveURL(/\/apply$/);
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(page.getByTestId("join-switch").getByRole("link", { name: "Coach" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");
    await page.locator('input[name="firstName"]').fill("Zed");

    await page.getByTestId("join-switch").getByRole("link", { name: "Teacher" }).click();
    await page.getByTestId("teacher-register-form").waitFor({ timeout: 60_000 });
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");

    await page.getByTestId("join-switch").getByRole("link", { name: "Coach" }).click();
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");

    await page.getByTestId("join-switch").getByRole("link", { name: "Student" }).click();
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("");
  });

  for (const viewport of [{ width: 1366, height: 768 }, { width: 375, height: 667 }]) {
    test(`at ${viewport.width}×${viewport.height}: the page scrolls as one, nothing in the card has a scrollbar, nothing sideways`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const cardScrolls = () =>
        page.getByTestId("auth-card").evaluate((card) =>
          [card, ...card.querySelectorAll<HTMLElement>("*")]
            .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT" && el.scrollHeight > el.clientHeight + 1)
            .map((el) => el.dataset.testid ?? el.tagName),
        );
      for (const [path, submit] of [["/register", "Create my account"], ["/register/teacher", "Apply as a teacher"], ["/apply", "Apply as a coach"]] as const) {
        await page.goto(path);
        await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
        expect(await cardScrolls(), `${path}: nothing in the card scrolls`).toEqual([]);
        expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth), `${path}: no sideways scroll`).toBeLessThanOrEqual(0);
        // The submit button is reached by scrolling the page.
        const button = page.getByRole("button", { name: submit });
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1 });
      }
    });
  }
});
