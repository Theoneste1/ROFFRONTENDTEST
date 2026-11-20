/**
 * Home location (capability homeLocationRules; owner, 2026-11-20) in the browser: the student form's home country
 * defaults to the school's country until the student chooses one; Rwanda asks province → district → sector (each choice
 * clears the ones after it); another country asks nothing more and clears them; switching back asks them again; an
 * international student registers with the country only; the profile edits the home location for Rwandan and
 * international accounts. Checked in the database. Synthetic data only; usernames are unique per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { pickCountry } from "../support/signup-layout";
import { withDb } from "../support/db";
import { signInWith } from "../support/session";

const RUN = Date.now().toString(36);
const PASSWORD = "Home-Loc-Pass-2026!";

async function selectWhenReady(page: Page, testId: string, label: string) {
  const select = page.getByTestId(testId);
  await expect(select).toBeEnabled({ timeout: 30_000 });
  const option = select.locator("option", { hasText: label }).first();
  await expect(option).toBeAttached({ timeout: 30_000 });
  await select.selectOption((await option.getAttribute("value"))!);
}

const homeCountry = (page: Page) => page.getByTestId("home-country");
const placeShown = (page: Page) => page.getByTestId("home-province");

async function sendUntilDone(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByRole("button", { name: "Create my account" }).click();
    const outcome = await Promise.race([
      page.getByTestId("register-done").waitFor({ timeout: 30_000 }).then(() => "done" as const, () => null),
      page.getByRole("alert").filter({ hasText: /Too many requests/i }).waitFor({ timeout: 30_000 }).then(() => "limited" as const, () => null),
    ]);
    if (outcome === "done") return;
    test.info().setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
  }
  await expect(page.getByTestId("register-done")).toBeVisible({ timeout: 30_000 });
}

test.describe.serial("home location", () => {
  test("student form: default from the school country, manual choice kept, Rwanda's place asked and reset, international registration", async ({ page }) => {
    test.setTimeout(180_000);
    const username = `home.intl.${RUN}`;
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });

    // 3. Default: a Rwandan school (the form starts there) → home country Rwanda, with the three required fields.
    await expect(homeCountry(page)).toHaveValue("Rwanda");
    await expect(placeShown(page)).toBeVisible();

    // 3. / 5. The school abroad in Uganda → the home country follows (not chosen by the student): Uganda, no place.
    await page.getByTestId("cascade-country").selectOption("UG");
    await expect(homeCountry(page)).toHaveValue("Uganda");
    await expect(placeShown(page)).toHaveCount(0);
    await page.getByTestId("cascade-country").selectOption("KE");
    await expect(homeCountry(page)).toHaveValue("Kenya");

    // 4. / 5. The student chooses Burundi: changing the school country no longer changes it.
    await pickCountry(page, "home-country", "Burundi");
    await page.getByTestId("cascade-country").selectOption("UG");
    await expect(homeCountry(page)).toHaveValue("Burundi");

    // 7. Back to Rwanda: the three fields are shown again, empty and required.
    await pickCountry(page, "home-country", "Rwanda");
    await expect(placeShown(page)).toBeVisible();
    await expect(page.getByTestId("home-district")).toBeDisabled();
    await expect(page.getByTestId("home-sector")).toBeDisabled();

    // 8. Province → district → sector; a new province resets district and sector, a new district resets the sector.
    await selectWhenReady(page, "home-province", "Kigali City");
    await selectWhenReady(page, "home-district", "Gasabo");
    await expect(page.getByTestId("home-sector")).toBeEnabled();
    await page.getByTestId("home-sector").selectOption({ index: 1 });
    await selectWhenReady(page, "home-district", "Kicukiro");
    await expect(page.getByTestId("home-sector")).toHaveValue("");
    await page.getByTestId("home-sector").selectOption({ index: 1 });
    await selectWhenReady(page, "home-province", "Southern Province");
    await expect(page.getByTestId("home-district")).toHaveValue("");
    await expect(page.getByTestId("home-sector")).toHaveValue("");
    await expect(page.getByTestId("home-sector")).toBeDisabled();

    // 6. Rwanda → Uganda: the Rwandan fields disappear; back to Rwanda, the earlier choices are gone.
    await pickCountry(page, "home-country", "Uganda");
    await expect(placeShown(page)).toHaveCount(0);
    await pickCountry(page, "home-country", "Rwanda");
    await expect(page.getByTestId("home-province")).toHaveValue("");
    // Required: sending without them highlights the province (hidden fields of another country never would).
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByText("Choose your home province.")).toBeVisible();

    // 2. An international student registers with the home country only.
    await pickCountry(page, "home-country", "Uganda");
    await page.locator('input[name="firstName"]').fill("Hope");
    await page.locator('input[name="lastName"]').fill(`Home${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await page.locator('input[name="dateOfBirth"]').fill("2011-04-20");
    await page.locator('input[name="guardianPhone"]').fill("+256712345678");
    await page.locator('select[name="gradeLevel"]').selectOption("S3");
    await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
    await page.getByLabel("School name").fill("Kampala Parents School");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    await sendUntilDone(page);
    const row = await withDb(async (c) => (await c.query(
      `SELECT country, "homeProvince", "homeDistrict", "homeSector", a."claimedCountry"
         FROM "User" u JOIN "StudentSchoolAffiliation" a ON a."studentId" = u.id WHERE u.username = $1`, [username])).rows[0]);
    // Home (Uganda) and school (Uganda, abroad) are kept separately.
    expect(row).toEqual({ country: "UG", homeProvince: null, homeDistrict: null, homeSector: null, claimedCountry: "UG" });
  });

  test("1. a Rwandan student registers with country → province → district → sector", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `home.rw.${RUN}`;
    await page.goto("/register");
    await page.locator('input[name="firstName"]').waitFor({ timeout: 60_000 });
    await page.locator('input[name="firstName"]').fill("Aline");
    await page.locator('input[name="lastName"]').fill(`Home${RUN}`);
    await page.locator('input[name="gender"][value="FEMALE"]').check();
    await page.locator('input[name="dateOfBirth"]').fill("2011-06-15");
    await page.locator('input[name="guardianPhone"]').fill("0788123456");
    await page.locator('select[name="gradeLevel"]').selectOption("S2");
    await page.getByTestId("olympiad-interests").getByLabel("Mathematics").check();
    await page.getByTestId("cascade-country").selectOption("RW");
    await selectWhenReady(page, "cascade-province", "Southern Province");
    await selectWhenReady(page, "cascade-district", "Muhanga");
    await selectWhenReady(page, "cascade-sector", "Muhanga");
    await selectWhenReady(page, "cascade-school", "ACEJ KARAMA");
    await expect(homeCountry(page)).toHaveValue("Rwanda");
    await selectWhenReady(page, "home-province", "Kigali City");
    await selectWhenReady(page, "home-district", "Gasabo");
    await page.getByTestId("home-sector").selectOption({ index: 1 });
    const sector = await page.getByTestId("home-sector").inputValue();
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="email"]').fill(`${username}@e2e.local`);
    await page.locator('input[name="new-password"]').fill(PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(PASSWORD);
    await sendUntilDone(page);
    const row = await withDb(async (c) => (await c.query(
      `SELECT country, "homeProvince", "homeDistrict", "homeSector" FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(row).toEqual({ country: "RW", homeProvince: "Kigali City", homeDistrict: "Gasabo", homeSector: sector });
  });

  test("9. profile editing: an international student moves home to Rwanda, then abroad again", async ({ page }) => {
    test.setTimeout(150_000);
    const username = `home.intl.${RUN}`;
    // The account registered above; signing in needs it activated and approved (synthetic account).
    await withDb((c) => c.query(`UPDATE "User" SET "activatedAt" = now(), "isApproved" = true WHERE username = $1`, [username]));
    await signInWith(page, username, PASSWORD);
    await page.goto("/student/profile");
    const form = page.getByTestId("home-location-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("profile-home-country")).toHaveValue("Uganda");
    await expect(page.getByTestId("profile-home-province")).toHaveCount(0);

    await pickCountry(page, "profile-home-country", "Rwanda");
    await page.getByTestId("home-location-save").click();
    await expect(form.getByText("Choose your home province.")).toBeVisible();
    await selectWhenReady(page, "profile-home-province", "Kigali City");
    await selectWhenReady(page, "profile-home-district", "Gasabo");
    await page.getByTestId("profile-home-sector").selectOption({ index: 1 });
    await page.getByTestId("home-location-save").click();
    await expect(form.getByText("Your home location was saved.")).toBeVisible({ timeout: 30_000 });
    const rw = await withDb(async (c) => (await c.query(`SELECT country, "homeProvince", "homeDistrict" FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(rw).toEqual({ country: "RW", homeProvince: "Kigali City", homeDistrict: "Gasabo" });

    await pickCountry(page, "profile-home-country", "Kenya");
    await expect(page.getByTestId("profile-home-province")).toHaveCount(0);
    await page.getByTestId("home-location-save").click();
    await expect(form.getByText("Your home location was saved.")).toBeVisible({ timeout: 30_000 });
    const ke = await withDb(async (c) => (await c.query(`SELECT country, "homeProvince", "homeDistrict", "homeSector" FROM "User" WHERE username = $1`, [username])).rows[0]);
    expect(ke).toEqual({ country: "KE", homeProvince: null, homeDistrict: null, homeSector: null });
  });
});
