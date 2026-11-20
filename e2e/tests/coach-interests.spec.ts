/**
 * Coaches' subjects in the browser (owner decision 2026-11-19, Option A — the existing olympiadInterests):
 *  - the coach application asks "Which subjects are you interested in coaching?" (at least one) and sends them;
 *  - a Coach sees "Not set", then chooses and saves their subjects on My Profile (at least one; kept after reload);
 *  - an Administrator sees and edits a Coach's subjects on the account page; the Admin Users list shows them, and
 *    "Not set" for a coach without any;
 *  - an Administrator whose users.manageCoaches is removed by an individual DENY override sees the subjects but no
 *    "Edit subjects" (the backend refuses that edit with 403).
 * Each result is checked in the database. Synthetic data only; usernames are unique per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { withDb } from "../support/db";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";
import { nextStep, progress } from "../support/wizard";

const RUN = Date.now().toString(36);
const QUESTION = "Which subjects are you interested in coaching?";
const REQUIRED = "Please choose at least one subject";

/** An approved, activated Coach without subjects (as existing coaches are), signing in with PASSWORD. */
async function createCoach(username: string) {
  return withDb(async (c) => (await c.query<{ id: string }>(
    `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'Subject', $2, $3, 'MENTOR', $4, now(), true, now()) RETURNING id`,
    [username, `Coach${RUN}`, `${username}@e2e.local`, hashSync(PASSWORD, 4)],
  )).rows[0].id);
}
const interestsOf = (username: string) =>
  withDb(async (c) => (await c.query(`SELECT "olympiadInterests"::text AS i FROM "User" WHERE username = $1`, [username])).rows[0]?.i as string);

async function submitApplication(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: "Apply as a coach" }).click();
    const outcome = await Promise.race([
      page.getByTestId("apply-done").waitFor({ timeout: 30_000 }).then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome !== "limited") break;
    test.info().setTimeout(test.info().timeout + 70_000);
    await page.waitForTimeout(61_000);
  }
  await expect(page.getByTestId("apply-done")).toBeVisible({ timeout: 30_000 });
}

test.describe("coach subjects", () => {
  test("the coach application requires at least one subject and sends the ones chosen", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `subjects.apply.${RUN}`;
    await page.goto("/apply");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Sara");
    await page.locator('input[name="lastName"]').fill(`Subjects${RUN}`);
    await page.getByTestId("coach-country").selectOption("RW");
    await page.locator('input[name="phone"]').fill("0788333444");
    await nextStep(page, "Profile picture");   // the optional picture: its own screen of "About you"
    await nextStep(page, "Your background");
    const subjects = page.getByTestId("olympiad-interests");
    await expect(subjects.getByText(QUESTION)).toBeVisible();
    await expect(subjects.locator("legend .text-red-500")).toHaveText("*");
    await page.locator('input[name="occupation"]').fill("Physics lecturer");
    await page.getByTestId("coach-education").selectOption("MASTER");
    // No subject: Next is refused on this step with the message.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(REQUIRED)).toBeVisible();
    await expect(progress(page)).toContainText("Step 3 of 5");
    await subjects.getByLabel("Mathematics").check();
    await subjects.getByLabel("Computing").check();
    await expect(page.getByText(REQUIRED)).toHaveCount(0);
    await nextStep(page, "Your experience");
    await page.locator('textarea[name="expertise"]').fill("Olympiad mathematics and computing.");
    await page.locator('textarea[name="relevantExperience"]').fill("Four years of olympiad training camps.");
    await nextStep(page, "Your account");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    await submitApplication(page);
    const row = await withDb(async (c) => (await c.query(`SELECT status::text AS status, "olympiadInterests"::text AS i FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);
    expect(row).toEqual({ status: "PENDING", i: "{MATHEMATICS,COMPUTING}" });
  });

  test("a coach without subjects sees 'Not set', then chooses and saves them on My Profile (at least one; kept)", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `subjects.profile.${RUN}`;
    await createCoach(username);
    await signInWith(page, username, PASSWORD);
    await page.goto("/mentor/profile");
    const card = page.getByTestId("coach-subjects-form");
    await card.waitFor({ timeout: 30_000 });
    await expect(page.getByText("Coaching subjects", { exact: true }).first()).toBeVisible();
    await expect(page.locator("dd", { hasText: "Not set" })).toBeVisible();
    await expect(card.getByText(QUESTION)).toBeVisible();
    await card.getByLabel("Physics").check();
    await card.getByLabel("Mathematics").check();
    await card.getByRole("button", { name: "Save subjects" }).click();
    await expect(card.getByText("Your coaching subjects were saved.")).toBeVisible();
    expect(await interestsOf(username)).toBe("{MATHEMATICS,PHYSICS}");
    // Kept after a reload and after signing in again.
    await page.reload();
    await expect(page.getByTestId("coach-subjects-form").getByLabel("Physics")).toBeChecked({ timeout: 30_000 });
    await expect(page.locator("dd", { hasText: "Mathematics, Physics" })).toBeVisible();
    // At least one: clearing every subject is refused with the message.
    const again = page.getByTestId("coach-subjects-form");
    await again.getByLabel("Physics").uncheck();
    await again.getByLabel("Mathematics").uncheck();
    await again.getByRole("button", { name: "Save subjects" }).click();
    await expect(again.getByText(REQUIRED)).toBeVisible();
    expect(await interestsOf(username)).toBe("{MATHEMATICS,PHYSICS}");
  });

  test("an Administrator sees 'Not set', edits a coach's subjects, and the users list shows them", async ({ page }) => {
    test.setTimeout(150_000);
    const edited = `subjects.admin.${RUN}`;
    const untouched = `subjects.none.${RUN}`;
    const id = await createCoach(edited);
    await createCoach(untouched);
    await signIn(page, "admin");
    await page.goto(`/admin/users/${id}`);
    const card = page.getByTestId("coach-subjects-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("coach-subjects")).toHaveText("Not set");
    await card.getByRole("button", { name: "Edit subjects" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit coaching subjects" });
    await expect(dialog.getByText(QUESTION)).toBeVisible();
    await dialog.getByRole("button", { name: "Save subjects" }).click();
    await expect(dialog.getByText(REQUIRED)).toBeVisible();
    await dialog.getByLabel("Computing").check();
    await dialog.getByRole("button", { name: "Save subjects" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByTestId("coach-subjects")).toHaveText("Computing");
    expect(await interestsOf(edited)).toBe("{COMPUTING}");
    const audit = await withDb(async (c) => (await c.query(
      `SELECT metadata FROM "AuditLog" WHERE action = 'UPDATE_USER' AND "entityId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [id])).rows[0]);
    expect(audit.metadata.changes).toEqual({ olympiadInterests: { from: [], to: ["COMPUTING"] } });

    await page.goto(`/admin/users?q=${encodeURIComponent(RUN)}&role=MENTOR`);
    const rowOf = (username: string) => page.locator("tr", { hasText: username });
    await expect(rowOf(edited).getByTestId("coach-subjects-note")).toHaveText("Subjects: Computing", { timeout: 30_000 });
    await expect(rowOf(untouched).getByTestId("coach-subjects-note")).toHaveText("Subjects: Not set");
    expect(await interestsOf(untouched)).toBe("{}");
  });

  test("an Administrator denied users.manageCoaches sees the subjects but is not offered Edit subjects (the API refuses it)", async ({ page, request }) => {
    test.setTimeout(120_000);
    const coachId = await createCoach(`subjects.denied.${RUN}`);
    const adminName = `subjects.admin-denied.${RUN}`;
    await withDb(async (c) => {
      const adminId = (await c.query<{ id: string }>(
        `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Denied', $2, $3, 'ADMIN', $4, now(), true, now()) RETURNING id`,
        [adminName, `Admin${RUN}`, `${adminName}@e2e.local`, hashSync(PASSWORD, 4)],
      )).rows[0].id;
      await c.query(
        `INSERT INTO "UserPermissionOverride" (id, "userId", permission, effect, reason)
         VALUES (gen_random_uuid()::text, $1, 'users.manageCoaches', 'DENY', 'e2e: coach management removed for this Administrator')`,
        [adminId],
      );
    });
    // The backend refuses the edit for this Administrator (users.manageCoaches is denied)...
    const api = process.env.E2E_API_URL ?? "http://127.0.0.1:4100";
    const login = await request.post(`${api}/api/v1/auth/login`, { data: { username: adminName, password: PASSWORD } });
    expect(login.ok(), await login.text()).toBe(true);
    const token = (await login.json()).access_token as string;
    const refused = await request.patch(`${api}/api/v1/admin/users/${coachId}`, {
      headers: { authorization: `Bearer ${token}` }, data: { olympiadInterests: ["PHYSICS"] },
    });
    expect(refused.status()).toBe(403);
    expect(await interestsOf(`subjects.denied.${RUN}`)).toBe("{}");
    // ...so the page shows the subjects without offering the button.
    await signInWith(page, adminName, PASSWORD);
    await page.goto(`/admin/users/${coachId}`);
    const card = page.getByTestId("coach-subjects-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("coach-subjects")).toHaveText("Not set");
    await expect(card.getByRole("button", { name: "Edit subjects" })).toHaveCount(0);
  });
});
