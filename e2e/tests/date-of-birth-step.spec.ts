/**
 * First-sign-in date of birth (owner decision 9.3, 2026-11-18), real backend + PostgreSQL.
 *
 * A student created by an Administrator, invited or imported may have no date of birth. At sign-in the student portal
 * shows only the date-of-birth step; an invalid date is refused; once a valid date is given the portal opens and the
 * step does not come back. (Students with a date of birth are covered by role-journeys: they go straight to the portal.)
 */
import { expect, test, type Page } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { PASSWORD } from "../support/accounts";
import { withDb } from "../support/db";
import { signInWith } from "../support/session";

const USERNAME = `e2e.nodob.${Date.now().toString(36)}`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    const junior = (await c.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR' LIMIT 1`)).rows[0]?.id ?? null;
    // As an Administrator-created student: approved, activated, no date of birth.
    await c.query(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt",
                           "gradeLevel", "divisionId", "homeLocation", "dateOfBirth")
       VALUES (gen_random_uuid()::text, $1, 'Nadia', 'E2E', $2, 'STUDENT', $3, now(), true, now(), 'S2', $4, 'Huye', NULL)`,
      [USERNAME, `${USERNAME}@e2e.local`, hashSync(PASSWORD, 4), junior],
    );
  });
});

/** Once the page's requests have settled, the portal shows no error (no "Couldn't load…", no error alert). */
async function expectNoErrorState(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Couldn.t load/)).toHaveCount(0);
  // Any alert except Next.js's route announcer (a role="alert" live region that repeats the page heading).
  await expect(page.locator('[role="alert"]:not(next-route-announcer [role="alert"])')).toHaveCount(0);
}

test("a student without a date of birth gives it at first sign-in, then reaches the portal", async ({ page }) => {
  await signInWith(page, USERNAME, PASSWORD);

  // Only the step: no portal navigation.
  await expect(page.getByRole("heading", { name: "One more step, Nadia" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sidebar-nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Too young: refused in the form, nothing sent.
  const dob = page.locator('input[name="dateOfBirth"]');
  const year = new Date().getFullYear();
  await dob.fill(`${year - 2}-01-15`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Students must be 5 to 30 years old. Check your date of birth.")).toBeVisible();

  await dob.fill(`${year - 14}-03-04`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("sidebar-nav").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /One more step/ })).toHaveCount(0);
  // The dashboard's own requests (refused while the step was pending) now succeed.
  await expectNoErrorState(page);

  const stored = await withDb(async (c) =>
    (await c.query<{ d: string }>(`SELECT to_char("dateOfBirth", 'YYYY-MM-DD') AS d FROM "User" WHERE username = $1`, [USERNAME])).rows[0].d);
  expect(stored).toBe(`${year - 14}-03-04`);

  // Reload: the step does not come back.
  await page.reload();
  await expect(page.getByTestId("sidebar-nav").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /One more step/ })).toHaveCount(0);
  await expectNoErrorState(page);
});
