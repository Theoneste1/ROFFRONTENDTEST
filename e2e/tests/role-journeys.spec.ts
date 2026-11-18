/**
 * Every role's own portal, in a real browser against the real backend and PostgreSQL — one sign-in per role:
 *  - each role lands on its own dashboard, its own pages load without errors, and another role's portal is refused;
 *  - Student: profile with the date of birth;
 *  - Coach / Head Coach: the review queue; the Head Coach also the programme pages;
 *  - Administrator: a student's user page shows the date of birth (with age) and the close-family phone (ACC-02) and the
 *    Registration history card (REG-13);
 *  - Super Administrator: a Teacher's user page shows the permission overrides card.
 * Run on its own (the backend allows 10 sign-ins a minute per address; this file signs in six times).
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";
import type { AccountKey } from "../support/accounts";
import { idOf, withDb } from "../support/db";

let studentId: string;
let teacherId: string;

test.beforeAll(async () => {
  await withDb(async (c) => {
    studentId = await idOf(c, "e2e.student");
    teacherId = await idOf(c, "e2e.teacher");
    await c.query(`UPDATE "User" SET "guardianPhone" = '+250788000111' WHERE id = $1`, [studentId]);
  });
});

/** No error page and no "Couldn't load" message on the current page. */
async function loadsCleanly(page: Page) {
  await expect(page.getByText(/Couldn't load|Something went wrong|Application error/i)).toHaveCount(0);
}

const portals: Array<{ who: AccountKey; home: RegExp; pages: string[]; foreign: string }> = [
  { who: "student", home: /\/student\/dashboard/, pages: ["/student/assignments", "/student/courses", "/student/notifications"], foreign: "/admin/dashboard" },
  { who: "coach", home: /\/mentor\/dashboard/, pages: ["/mentor/reviews", "/mentor/assignments", "/mentor/notifications"], foreign: "/student/dashboard" },
  { who: "headCoach", home: /\/mentor\/dashboard/, pages: ["/mentor/reviews", "/mentor/programme"], foreign: "/admin/dashboard" },
  { who: "teacher", home: /\/teacher\/dashboard/, pages: ["/teacher/profile", "/teacher/notifications"], foreign: "/admin/users" },
];

for (const p of portals) {
  test.describe.serial(`${p.who}: own portal`, () => {
    let page: Page;
    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await signIn(page, p.who);
    });
    test.afterAll(async () => page.close());

    test("lands on its dashboard; its pages load; another role's portal is refused", async () => {
      await expect(page).toHaveURL(p.home);
      await loadsCleanly(page);
      for (const path of p.pages) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
        await loadsCleanly(page);
      }
      await page.goto(p.foreign);
      await expect(page).not.toHaveURL(new RegExp(`${p.foreign.replace(/\//g, "\\/")}$`));
    });

    if (p.who === "student") {
      test("profile shows the date of birth", async () => {
        await page.goto("/student/profile");
        await expect(page.getByText("Date of birth").first()).toBeVisible();
      });
    }
  });
}

test.describe.serial("Administrator: a student's user page", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  test("date of birth with age, close-family phone (ACC-02), registration history (REG-13)", async () => {
    await page.goto(`/admin/users/${studentId}`);
    await expect(page.getByText("Date of birth", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 May 2012 \(\d+ years\)/)).toBeVisible();
    await expect(page.getByText("+250788000111")).toBeVisible();
    const history = page.getByTestId("registration-history");
    await expect(history).toContainText("Registration history");
    await expect(history).toContainText("Created");
    await expect(history).toContainText("Account state");
    await loadsCleanly(page);
  });

  test("the Administrator corrects the date of birth with a reason; the history shows old and new dates (owner approval)", async () => {
    await page.goto(`/admin/users/${studentId}`);
    const card = page.getByTestId("date-of-birth-card");
    const correct = async (date: string, reason: string) => {
      await card.getByRole("button", { name: "Correct date of birth" }).click();
      await page.getByLabel("Date of birth", { exact: false }).last().fill(date);
      await page.getByLabel("Reason").fill(reason);
      await page.getByRole("button", { name: "Save correction" }).click();
      await expect(page.getByRole("button", { name: "Save correction" })).toHaveCount(0);
    };
    // A reason is required in the form too.
    await card.getByRole("button", { name: "Correct date of birth" }).click();
    await page.getByLabel("Date of birth", { exact: false }).last().fill("2012-05-02");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByRole("button", { name: "Save correction" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await correct("2012-05-02", "Birth certificate shows the 2nd");
    await expect(page.getByText(/2 May 2012 \(\d+ years\)/)).toBeVisible();
    await expect(card).toContainText("Birth certificate shows the 2nd");
    await expect(card).toContainText("1 May 2012");
    await expect(card).toContainText("2 May 2012");
    // Back to the fixture date, so repeated runs see the same student.
    await correct("2012-05-01", "Restored for the next test run");
    await expect(page.getByText(/1 May 2012 \(\d+ years\)/)).toBeVisible();
    await loadsCleanly(page);
  });
});

test.describe.serial("Super Administrator: a Teacher's permissions", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "superAdmin");
  });
  test.afterAll(async () => page.close());

  test("the teacher's page shows teacher access and permission overrides", async () => {
    await page.goto(`/admin/users/${teacherId}`);
    await expect(page.getByTestId("teacher-access")).toBeVisible();
    await expect(page.getByTestId("permission-overrides")).toBeVisible();
    await loadsCleanly(page);
  });
});
