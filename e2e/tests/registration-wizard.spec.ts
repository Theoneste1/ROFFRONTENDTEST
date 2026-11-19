/**
 * The registration forms one step at a time (app/components/forms/FormWizard) in the browser: the progress and its ARIA,
 * Next checking only the shown step with the forms' own rules, Back keeping everything typed, focus, Enter, a double click
 * on Next, a field the server refuses taking the form back to its step, a refusal naming no field staying on the step, the
 * Student / Teacher / Coach switch starting each form afresh, and the card fitting the window (no page scroll and no
 * scrollbar in the card: every step is cut to fit; every step and size in signup-layout.spec.ts). Against the real
 * backend; synthetic data only.
 */
import { expect, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { nextStep, progress } from "../support/wizard";

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

const current = (page: Page) => page.getByTestId("wizard-steps").locator('li[aria-current="step"]');
const live = (page: Page) => page.getByTestId("wizard-live");

async function studentAboutYou(page: Page) {
  await page.locator('input[name="firstName"]').fill("Aline");
  await page.locator('input[name="lastName"]').fill(`Wizard${RUN}`);
  await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
  await page.getByTestId("home-country").selectOption("RW");
}

test.describe("registration forms, one step at a time", () => {
  test("student: progress and ARIA, Next checks only the shown step, Enter moves on, Back keeps everything, focus", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });

    // Step 1 of 7: the first step is current, the other steps' fields are not shown, no Back.
    await expect(progress(page)).toContainText("Step 1 of 7");
    await expect(progress(page)).toContainText("About you");
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toContainText("About you");
    await expect(page.getByTestId("wizard-steps").locator("li")).toHaveCount(7);
    await expect(page.locator('input[name="username"]')).toBeHidden();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create my account" })).toHaveCount(0);

    // Next with nothing filled: the existing messages, on this step only; focus on the first highlighted field.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Enter your first name.")).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).toBeFocused();
    await expect(live(page)).toContainText("Step 1 of 7: About you. Please check the highlighted fields.");
    await expect(progress(page)).toContainText("Step 1 of 7");
    await expect(page.getByText("Choose your grade.")).toHaveCount(0);

    // Enter in a one-line field moves to the next step (it never sends the form).
    await studentAboutYou(page);
    await page.locator('input[name="lastName"]').press("Enter");
    await expect(progress(page)).toContainText("Step 2 of 7");
    await expect(page.getByRole("heading", { name: "Phone and picture" })).toBeFocused();
    await expect(live(page)).toContainText("Step 2 of 7: Phone and picture");
    await expect(page.getByTestId("wizard-steps").locator("li").first()).toHaveAttribute("data-status", "complete");
    await expect(current(page)).toContainText("Phone and picture");
    await expect(page.getByTestId("register-done")).toHaveCount(0);
    await page.locator('input[name="guardianPhone"]').fill("0788123456");
    await nextStep(page, "Your studies");

    // Step 3's own rule.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Choose your grade.")).toBeVisible();
    await expect(page.locator('select[name="gradeLevel"]')).toBeFocused();
    await page.locator('select[name="gradeLevel"]').selectOption("S2");
    await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();

    // Back keeps everything typed and chosen, both ways.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(progress(page)).toContainText("Step 2 of 7");
    await expect(page.getByRole("heading", { name: "Phone and picture" })).toBeFocused();
    await expect(page.locator('input[name="firstName"]')).toHaveValue("Aline");
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("2011-06-15");
    await expect(page.locator('input[name="guardianPhone"]')).toHaveValue("0788123456");
    // A double click on Next moves one step only (step 3 is complete, so a second Next would have moved on).
    await page.getByRole("button", { name: "Next", exact: true }).dblclick();
    await expect(progress(page)).toContainText("Step 3 of 7");
    await page.waitForTimeout(300);
    await expect(progress(page)).toContainText("Step 3 of 7");
    await expect(page.locator('select[name="gradeLevel"]')).toHaveValue("S2");
    await expect(page.getByTestId("olympiad-interests").getByLabel("Mathematics")).toBeChecked();

    // On to the last step: Back and the form's own submit label, no Next.
    await nextStep(page, "School location");
    await page.getByTestId("cascade-country").selectOption("RW");
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await nextStep(page, "Your school");
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await nextStep(page, "Where you live");
    await selectWhenReady(page, "home-province", "Kigali City");
    await selectWhenReady(page, "home-district", "Gasabo");
    await page.getByTestId("home-sector").selectOption({ index: 1 });
    await nextStep(page, "Your account");
    await expect(progress(page)).toContainText("Step 7 of 7");
    await expect(page.getByRole("button", { name: "Create my account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    // The school chosen two steps ago is still there.
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("cascade-school")).not.toHaveValue("");
  });

  test("teacher: a field the server refuses takes the form back to its step, with the server's message", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `wiz.teacher.${RUN}`;
    await page.goto("/register/teacher");
    const form = page.getByTestId("teacher-register-form");
    await form.waitFor({ timeout: 60_000 });
    await form.locator('input[name="firstName"]').fill("Jean");
    await form.locator('input[name="lastName"]').fill(`Wizard${RUN}`);
    // Passes the form's own e-mail check; the server's stricter check refuses it.
    await form.locator('input[name="email"]').fill(`${username}@exa_mple.com`);
    await form.getByLabel("Country *", { exact: true }).selectOption("RW");
    await form.locator('input[name="phone"]').fill("0788654321");
    await nextStep(page, "Your teaching");
    await form.locator('input[name="position"]').fill("Mathematics teacher");
    await form.getByLabel("Mathematics").check();
    await nextStep(page, "School location");
    await selectWhenReady(page, "cascade-province", SCHOOL.province);
    await selectWhenReady(page, "cascade-district", SCHOOL.district);
    await selectWhenReady(page, "cascade-sector", SCHOOL.sector);
    await nextStep(page, "Your school");
    await selectWhenReady(page, "cascade-school", SCHOOL.name);
    await nextStep(page, "Home location");
    await form.getByLabel("Home district *").selectOption({ label: "Gasabo" });
    await expect(form.getByLabel("Home sector *")).toBeEnabled();
    await form.getByLabel("Home sector *").selectOption({ index: 1 });
    await nextStep(page, "Your account");
    await form.locator('input[name="username"]').fill(username);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    await submitUntilAnswered(page, "Apply as a teacher", () => expect(progress(page)).toContainText("Step 1 of 6", { timeout: 30_000 }));

    await expect(progress(page)).toContainText("Step 1 of 6");
    await expect(page.getByText("email must be an email")).toBeVisible();
    await expect(form.locator('input[name="email"]')).toBeFocused();
    await expect(live(page)).toContainText("Please check the highlighted fields.");
    // Everything else is still there.
    await expect(form.locator('input[name="phone"]')).toHaveValue("0788654321");
    const applications = await withDb(async (c) => Number((await c.query(`SELECT count(*) FROM "TeacherApplication" WHERE username = $1`, [username])).rows[0].count));
    expect(applications).toBe(0);
  });

  test("coach: Enter keeps new lines in a text area; a refusal naming no field stays on the last step with its message", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/apply");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(progress(page)).toContainText("Step 1 of 4");
    await page.locator('input[name="firstName"]').fill("Claude");
    await page.locator('input[name="lastName"]').fill(`Wizard${RUN}`);
    await page.getByTestId("coach-country").selectOption("RW");
    await page.locator('input[name="phone"]').fill("0788111222");
    await nextStep(page, "Your background");
    await page.locator('input[name="occupation"]').fill("Engineer");
    await page.getByTestId("coach-education").selectOption("BACHELOR");
    await page.getByTestId("olympiad-interests").getByLabel("Physics").check();
    await nextStep(page, "Your experience");
    const expertise = page.locator('textarea[name="expertise"]');
    await expertise.fill("Mechanics");
    await expertise.press("End");
    await expertise.press("Enter");
    await expertise.pressSequentially("Olympiad problem solving");
    await expect(expertise).toHaveValue("Mechanics\nOlympiad problem solving");
    await expect(progress(page)).toContainText("Step 3 of 4");
    await page.locator('textarea[name="relevantExperience"]').fill("Three years coaching national olympiad teams.");
    await nextStep(page, "Your account");
    // "admin" is taken: the backend refuses the application without naming a field.
    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="email"]').fill(`wiz.coach.${RUN}@e2e.local`);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    const taken = page.getByRole("alert").filter({ hasText: "That username or e-mail is already in use" });
    await submitUntilAnswered(page, "Apply as a coach", () => taken.waitFor({ timeout: 30_000 }));
    await expect(taken).toBeVisible();
    await expect(taken).toBeInViewport();
    await expect(progress(page)).toContainText("Step 4 of 4");
    await expect(page.getByTestId("apply-done")).toHaveCount(0);
  });

  test("the Student / Teacher / Coach switch shows each form at step 1, with nothing carried over", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await studentAboutYou(page);
    await nextStep(page, "Phone and picture");

    await page.getByTestId("join-switch").getByRole("link", { name: "Coach" }).click();
    await expect(page).toHaveURL(/\/apply$/);
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(progress(page)).toContainText("Step 1 of 4");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");
    await page.locator('input[name="firstName"]').fill("Zed");

    await page.getByTestId("join-switch").getByRole("link", { name: "Teacher" }).click();
    await page.getByTestId("teacher-register-form").waitFor({ timeout: 60_000 });
    await expect(progress(page)).toContainText("Step 1 of 6");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");

    await page.getByTestId("join-switch").getByRole("link", { name: "Coach" }).click();
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(progress(page)).toContainText("Step 1 of 4");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");

    await page.getByTestId("join-switch").getByRole("link", { name: "Student" }).click();
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await expect(progress(page)).toContainText("Step 1 of 7");
    await expect(page.locator('input[name="firstName"]')).toHaveValue("");
    await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("");
  });

  for (const viewport of [{ width: 1366, height: 768 }, { width: 375, height: 667 }]) {
    test(`the card fits a ${viewport.width}×${viewport.height} window: no page scroll and no scrollbar in the card`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // Elements of the card with a scrollbar of their own (none: every step is cut to fit the window).
      const cardScrolls = () =>
        page.getByTestId("auth-card").evaluate((card) =>
          [card, ...card.querySelectorAll<HTMLElement>("*")]
            .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT" && el.scrollHeight > el.clientHeight + 1)
            .map((el) => el.dataset.testid ?? el.tagName),
        );
      for (const [path, ready] of [["/register", 'input[name="firstName"]'], ["/register/teacher", '[data-testid="teacher-register-form"]'], ["/apply", 'input[name="firstName"]']] as const) {
        await page.goto(path);
        await page.locator(ready).first().waitFor({ timeout: 60_000 });
        const pageScroll = () => page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight);
        expect(await pageScroll(), `${path}: the page does not scroll`).toBeLessThanOrEqual(0);
        await expect(page.getByRole("button", { name: "Next", exact: true })).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId("wizard-progress")).toBeInViewport({ ratio: 1 });
        expect(await cardScrolls(), `${path}: nothing in the card scrolls`).toEqual([]);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        expect(await pageScroll(), `${path}: still no page scroll`).toBeLessThanOrEqual(0);
      }
      // The student's close-family phone (which used to need the inner scroll) is shown whole on its step, nothing scrolls.
      await page.goto("/register");
      await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
      await page.locator('input[name="firstName"]').fill("Aline");
      await page.locator('input[name="lastName"]').fill(`Wizard${RUN}`);
      if (viewport.width <= 640) await page.getByRole("button", { name: "Next", exact: true }).click();   // phones: the names, then birth and country
      await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
      await page.getByTestId("home-country").selectOption("RW");
      await page.getByRole("button", { name: "Next", exact: true }).click();
      expect(await cardScrolls()).toEqual([]);
      await expect(page.locator('input[name="guardianPhone"]')).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }
});
