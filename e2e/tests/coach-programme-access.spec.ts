/**
 * Coaches across their programmes (owner 2026-11-23), in a real browser against the real backend and PostgreSQL:
 *  1. A Mathematics coach (no course assignment at all) has Students and Results in the menu; Students lists the
 *     programme's students of every level, without contact details.
 *  2. The programme's Head Coach turns "See the programme's students" off for that coach, with a reason (Coach permissions).
 *  3. The coach's Students page is then empty, saying why.
 *  4. An Administrator gives it back on the coach's user page (Programme access). Each step checked in the database.
 * Fixtures are synthetic and unique per run.
 */
import { hashSync } from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { signIn, signInWith } from "../support/session";

const run = Date.now().toString(36);
const coachUser = `e2e.cp.${run}`;
const studentUser = `e2e.cps.${run}`;
const studentName = `Kevine${run}`;
let coachId: string;
let maths: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    maths = (await c.query(`SELECT id FROM "Discipline" WHERE code = 'MATHEMATICS'`)).rows[0].id;
    coachId = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt", gender)
       VALUES (gen_random_uuid()::text, $1, 'Coachie', $2, $3, 'MENTOR', $4, now(), true, now(), 'FEMALE') RETURNING id`,
      [coachUser, run, `${coachUser}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    const school = await createSchool(c, `E2E Coach School ${run}`);
    const studentId = await createStudent(c, studentUser, studentName, school, "VERIFIED");
    // A Senior student: the coach sees every level.
    const senior = (await c.query(`SELECT id FROM "Division" WHERE code = 'SENIOR' LIMIT 1`)).rows[0].id;
    await c.query(`UPDATE "User" SET "gradeLevel" = 'S5', "divisionId" = $2, "divisionManual" = true, phone = '+250788777000' WHERE id = $1`, [studentId, senior]);
    const head = await idOf(c, "e2e.head");
    for (const userId of [coachId, studentId, head]) {
      await c.query(
        `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source) VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL')
         ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [userId, maths],
      );
    }
  });
});

test("a programme coach has Students and Results; Students lists every level, without contact details", async ({ page }) => {
  await signInWith(page, coachUser, PASSWORD);
  const nav = page.getByTestId("sidebar-nav").first();
  await expect(nav.locator('a[href="/mentor/students"]')).toHaveCount(1);
  await expect(nav.locator('a[href="/mentor/results"]')).toHaveCount(1);
  await page.goto("/mentor/students");
  await expect(page.getByRole("heading", { name: "Students", level: 1 })).toBeVisible();
  await page.getByLabel("Search students").fill(studentName);
  const row = page.getByTestId(`coach-student-${studentUser}`);
  await expect(row).toContainText("Senior");
  await expect(page.locator("main")).not.toContainText("+250788777000");
  await page.goto("/mentor/results");
  await expect(page.getByRole("heading", { name: "Results", level: 1 })).toBeVisible();
});

test("the Head Coach turns seeing the students off for that coach, with a reason; the coach's page is then empty", async ({ page, browser }) => {
  await signIn(page, "headCoach");
  await page.goto("/mentor/programme");
  await page.getByRole("button", { name: "Coach permissions" }).click();
  await page.getByTestId("coach-permissions").getByLabel("Coach").selectOption(coachId);
  await page.getByTestId("switch-MATHEMATICS-STUDENTS").click();
  await page.getByTestId("removal-reason").fill("Works on marking only this term");
  await page.getByTestId("confirm-removal").click();
  await expect(page.getByTestId("access-MATHEMATICS-STUDENTS")).toContainText("Works on marking only this term");
  const row = await withDb(async (c) => (await c.query(
    `SELECT reason FROM "CoachProgrammeRestriction" WHERE "coachId" = $1 AND capability = 'STUDENTS' AND "liftedAt" IS NULL`, [coachId])).rows[0]);
  expect(row.reason).toBe("Works on marking only this term");

  const coachPage = await (await browser.newContext()).newPage();
  await signInWith(coachPage, coachUser, PASSWORD);
  await coachPage.goto("/mentor/students");
  await expect(coachPage.getByText("No programme students to show")).toBeVisible();
  await coachPage.context().close();
});

test("an Administrator gives it back on the coach's user page", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto(`/admin/users/${coachId}`);
  await expect(page.getByRole("heading", { name: "Programme access" })).toBeVisible();
  await expect(page.getByTestId("access-MATHEMATICS-STUDENTS")).toContainText("Works on marking only this term");
  await page.getByTestId("switch-MATHEMATICS-STUDENTS").click();
  await expect(page.getByTestId("access-MATHEMATICS-STUDENTS")).toContainText("On");
  const active = await withDb(async (c) => (await c.query(
    `SELECT count(*)::int AS n FROM "CoachProgrammeRestriction" WHERE "coachId" = $1 AND capability = 'STUDENTS' AND "liftedAt" IS NULL`, [coachId])).rows[0].n);
  expect(active).toBe(0);
});
