/**
 * A Coach edits no student profile data (owner 2026-11-27), in the browser:
 *  1. A Coach opens a student of their programme: the Olympiad level is shown, with no control to change it.
 *  2. The programme's Head Coach opens the same student and changes the level (saved, with its reason in the history).
 * The backend refuses a Coach on every student-editing route (backend e2e coach-no-student-edits).
 */
import { hashSync } from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, withDb } from "../support/db";
import { signInWith } from "../support/session";

const run = Date.now().toString(36);
const coachUser = `e2e.cro.${run}`;
const headUser = `e2e.croh.${run}`;
const studentUser = `e2e.cros.${run}`;
const studentName = `Rosine${run}`;
let studentId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    const maths = (await c.query(`SELECT id FROM "Discipline" WHERE code = 'MATHEMATICS'`)).rows[0].id;
    const account = async (username: string, firstName: string, role: "MENTOR" | "HEAD_COACH") => (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt", gender)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::"Role", $6, now(), true, now(), 'FEMALE') RETURNING id`,
      [username, firstName, run, `${username}@e2e.local`, role, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    const coach = await account(coachUser, "Coachro", "MENTOR");
    const head = await account(headUser, "Headro", "HEAD_COACH");
    const school = await createSchool(c, `E2E Read-only School ${run}`);
    studentId = await createStudent(c, studentUser, studentName, school, "VERIFIED");
    await c.query(`UPDATE "User" SET "gradeLevel" = 'S2' WHERE id = $1`, [studentId]);
    for (const userId of [coach, head, studentId]) {
      await c.query(
        `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source) VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL')
         ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [userId, maths],
      );
    }
  });
});

test("a Coach sees the student's Olympiad level, read only: no choice, reason or save", async ({ page }) => {
  await signInWith(page, coachUser, PASSWORD);
  await page.goto(`/mentor/profiles/${studentId}`);
  await expect(page.getByTestId("student-profile-header")).toContainText(studentName);
  const card = page.getByTestId("olympiad-level-card");
  await expect(card.getByTestId("olympiad-level-current")).toHaveText(/Junior/);
  await expect(card.getByTestId("olympiad-level-choice")).toHaveCount(0);
  await expect(card.getByTestId("olympiad-level-reason")).toHaveCount(0);
  await expect(card.getByTestId("olympiad-level-save")).toHaveCount(0);
});

test("the programme's Head Coach changes the same student's level; it is saved with its reason", async ({ page }) => {
  await signInWith(page, headUser, PASSWORD);
  await page.goto(`/mentor/profiles/${studentId}`);
  const card = page.getByTestId("olympiad-level-card");
  const senior = await withDb(async (c) => (await c.query(`SELECT id FROM "Division" WHERE code = 'SENIOR'`)).rows[0].id as string);
  await card.getByTestId("olympiad-level-choice").selectOption(senior);
  await card.getByTestId("olympiad-level-reason").fill("Strong results this term");
  await card.getByTestId("olympiad-level-save").click();
  await expect(card.getByTestId("olympiad-level-current")).toHaveText("Senior — set by hand");
  await expect(card.getByTestId("olympiad-level-history")).toContainText("Strong results this term");
  const row = await withDb(async (c) => (await c.query(`SELECT d.code, u."divisionManual" FROM "User" u JOIN "Division" d ON d.id = u."divisionId" WHERE u.id = $1`, [studentId])).rows[0]);
  expect(row).toEqual({ code: "SENIOR", divisionManual: true });
});
