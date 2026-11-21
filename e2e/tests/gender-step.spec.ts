/**
 * Accounts from before gender was asked at sign-up (capability genderStep; owner, 2026-11-20): a student or coach
 * without a gender is asked it once when signing in, then reaches the portal; it is recorded. An Administrator edits an
 * account's gender and home location (Home country; Rwanda: province → district → sector) on the user's page.
 * Synthetic accounts only; usernames are unique per run.
 */
import { expect, test } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { pickCountry } from "../support/signup-layout";
import { withDb } from "../support/db";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";

const RUN = Date.now().toString(36);

/** An approved, activated account without a gender (as accounts from before gender was asked are). */
async function createAccount(username: string, role: "STUDENT" | "MENTOR") {
  return withDb(async (c) => {
    const division = role === "STUDENT" ? (await c.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR'`)).rows[0]?.id ?? null : null;
    return (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt",
                           "dateOfBirth", "gradeLevel", "divisionId")
       VALUES (gen_random_uuid()::text, $1, 'Gina', $2, $3, $4, $5, now(), true, now(), $6, $7, $8) RETURNING id`,
      [username, `Step${RUN}`, `${username}@e2e.local`, role, hashSync(PASSWORD, 4),
        role === "STUDENT" ? "2011-02-03" : null, role === "STUDENT" ? "S2" : null, division],
    )).rows[0].id;
  });
}
const genderOf = (username: string) => withDb(async (c) => (await c.query(`SELECT gender::text AS g FROM "User" WHERE username = $1`, [username])).rows[0]?.g as string | null);

test.describe.serial("gender step and the Administrator's edit", () => {
  let coachId = "";

  test("a coach without a gender is asked once at sign-in, then reaches the portal", async ({ page }) => {
    test.setTimeout(120_000);
    const username = `gstep.coach.${RUN}`;
    coachId = await createAccount(username, "MENTOR");
    await signInWith(page, username, PASSWORD, { answerGender: false });
    const step = page.getByTestId("gender-step");
    await expect(step).toBeVisible({ timeout: 30_000 });
    await expect(step.getByRole("heading")).toContainText("One more step, Gina");
    // Required: continuing without a choice says so.
    await step.getByTestId("gender-step-continue").click();
    await expect(step.getByText("Choose your gender.")).toBeVisible();
    await step.locator('input[name="gender"][value="MALE"]').check();
    await step.getByTestId("gender-step-continue").click();
    await expect(step).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("sidebar-nav").first()).toBeVisible({ timeout: 30_000 });
    expect(await genderOf(username)).toBe("MALE");
    // Asked once: the next sign-in goes straight to the portal.
    await page.context().clearCookies();
    await signInWith(page, username, PASSWORD, { answerGender: false });
    await expect(page.getByTestId("sidebar-nav").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("gender-step")).toHaveCount(0);
  });

  test("a student without a gender is asked too", async ({ page }) => {
    test.setTimeout(120_000);
    const username = `gstep.student.${RUN}`;
    await createAccount(username, "STUDENT");
    await signInWith(page, username, PASSWORD, { answerGender: false });
    const step = page.getByTestId("gender-step");
    await expect(step).toBeVisible({ timeout: 30_000 });
    await step.locator('input[name="gender"][value="FEMALE"]').check();
    await step.getByTestId("gender-step-continue").click();
    await expect(step).toHaveCount(0, { timeout: 30_000 });
    expect(await genderOf(username)).toBe("FEMALE");
  });

  test("an Administrator corrects the coach's gender and sets a Rwandan home, then moves it abroad", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, "admin");
    await page.goto(`/admin/users/${coachId}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.getByLabel("Gender").selectOption("FEMALE");
    await pickCountry(page, "admin-home-country", "Rwanda");
    await page.getByRole("button", { name: "Save changes" }).click();
    // Rwanda: province, district and sector are required.
    await expect(page.getByText("Choose your home province.")).toBeVisible();
    const choose = async (testId: string, label: string) => {
      const select = page.getByTestId(testId);
      await expect(select).toBeEnabled({ timeout: 30_000 });
      await expect(select.locator("option", { hasText: label }).first()).toBeAttached({ timeout: 30_000 });
      await select.selectOption({ label });
    };
    await choose("admin-home-province", "Kigali City");
    await choose("admin-home-district", "Gasabo");
    await page.getByTestId("admin-home-sector").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => withDb(async (c) => (await c.query(
      `SELECT gender::text AS gender, country, "homeProvince", "homeDistrict" FROM "User" WHERE id = $1`, [coachId])).rows[0]), { timeout: 30_000 })
      .toEqual({ gender: "FEMALE", country: "RW", homeProvince: "Kigali City", homeDistrict: "Gasabo" });

    // Abroad: the Rwandan fields disappear and are cleared.
    await page.getByRole("button", { name: "Edit details" }).click();
    await pickCountry(page, "admin-home-country", "Kenya");
    await expect(page.getByTestId("admin-home-province")).toHaveCount(0);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(async () => withDb(async (c) => (await c.query(
      `SELECT country, "homeProvince", "homeDistrict", "homeSector" FROM "User" WHERE id = $1`, [coachId])).rows[0]), { timeout: 30_000 })
      .toEqual({ country: "KE", homeProvince: null, homeDistrict: null, homeSector: null });
  });
});
