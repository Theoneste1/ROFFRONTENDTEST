/**
 * Course homework by teachers, by default (owner decision 2026-11-24, capability teacherHomeworkDefault), in a real
 * browser against the real backend and PostgreSQL:
 *  1. the Administrator sees the teacher's "Course homework" switch on (beside the test-submission switch);
 *  2. the teacher, with no permission granted, opens a student of their school and hands homework in for them — the
 *     attempt is recorded as sent by the teacher;
 *  3. the Administrator turns course homework off (reason required, audited);
 *  4. the teacher can no longer open the student's homework or hand it in (the backend refuses too); turned back on.
 * Fixtures (fresh per run, synthetic): a school with the e2e Teacher, one verified student, one published assignment of
 * a published course the Junior division offers. One sign-in per role (the backend allows 10 sign-ins a minute).
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { passwordOf } from "../support/accounts";
import { signIn } from "../support/session";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "../support/db";

const run = Date.now().toString(36);
const names = { school: `E2E Homework School ${run}`, student: `Hana${run}`, assignment: `E2E homework ${run}` };
let teacherId: string;
let studentId: string;

async function apiToken(request: APIRequestContext, username: string, password: string) {
  const r = await request.post("/api/v1/auth/login", { data: { username, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token as string;
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    const schoolId = await createSchool(c, names.school);
    teacherId = await idOf(c, "e2e.teacher");
    await assignTeacherSchool(c, teacherId, schoolId);
    studentId = await createStudent(c, `e2e.hw.${run}`, names.student, schoolId, "VERIFIED");
    const ref = (await c.query(
      `SELECT (SELECT cd."courseId" FROM "CourseDivision" cd JOIN "Course" co ON co.id = cd."courseId" JOIN "Division" d ON d.id = cd."divisionId"
                WHERE d.code = 'JUNIOR' AND cd."isActive" AND co.status = 'PUBLISHED' ORDER BY co.id LIMIT 1) AS course,
              (SELECT id FROM "Division" WHERE code = 'JUNIOR') AS division,
              (SELECT id FROM "AcademicYear" ORDER BY "isCurrent" DESC NULLS LAST, "startsOn" DESC LIMIT 1) AS year,
              (SELECT id FROM "User" WHERE username = 'admin') AS admin`)).rows[0];
    expect(ref.course, "the seed has a published course offered to the Junior division").toBeTruthy();
    await c.query(
      `INSERT INTO "Assignment" (id, title, instructions, deadline, points, "maximumMarks", status, "publishedAt", "allowResubmission", "maxResubmissions",
                                 "courseId", "divisionId", "academicYearId", "createdById", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Solve the problems.', now() + interval '30 days', 10, 10, 'PUBLISHED', now(), true, 3, $2, $3, $4, $5, now())`,
      [names.assignment, ref.course, ref.division, ref.year, ref.admin],
    );
    // The switch starts on (no earlier run's DENY left on the shared e2e teacher).
    await c.query(`UPDATE "UserPermissionOverride" SET "revokedAt" = now() WHERE "userId" = $1 AND effect = 'DENY' AND "revokedAt" IS NULL
                   AND permission IN ('students.viewProgress', 'submissions.submitOnBehalf')`, [teacherId]);
  });
});

test.describe.serial("Course homework by teachers", () => {
  let admin: Page;
  let teacher: Page;
  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(admin, "admin");
    teacher = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(teacher, "teacher");
  });
  test.afterAll(async () => {
    await admin.context().close();
    await teacher.context().close();
  });

  const card = () => admin.getByTestId("teacher-homework-submission");
  const homework = () => teacher.getByTestId("teacher-assignment").filter({ hasText: names.assignment });

  test("the Administrator sees the Course homework switch on, beside the test-submission switch", async () => {
    await admin.goto(`/admin/users/${teacherId}`);
    await expect(card().getByTestId("teacher-homework-submission-state")).toContainText("Allowed", { timeout: 30_000 });
    await expect(card()).toContainText("Hands in course homework for their students — on by default");
    await expect(admin.getByTestId("teacher-test-submission")).toBeVisible();
    // The now-default permissions are no longer offered as extra permissions.
    const offered = await admin.getByTestId("grant-delegation").getByLabel("Permission").locator("option").allTextContents();
    expect(offered).toEqual(["Choose a permission", "View student profiles"]);
  });

  test("the teacher hands in homework for a student of their school, with no permission granted", async () => {
    await teacher.goto("/teacher/dashboard");
    await teacher.getByPlaceholder("Search by name or username…").fill(names.student);
    const row = teacher.getByTestId("teacher-student-row").filter({ hasText: names.student });
    await expect(row).toContainText("Progress", { timeout: 30_000 });
    await expect(row).toContainText("Submit for");
    await row.getByRole("link", { name: /Open/ }).click();
    await expect(teacher).toHaveURL(new RegExp(`/teacher/students/${studentId}$`));
    await expect(homework()).toContainText("Not submitted", { timeout: 30_000 });
    await homework().getByRole("button", { name: "Submit for this student" }).click();
    await homework().getByLabel("The student's answer").fill("Answer copied from the student's exercise book.");
    // Without the profile permission the student is named by their username.
    await homework().getByRole("button", { name: `Submit for @e2e.hw.${run}` }).click();
    await expect(homework()).toContainText("Submitted by", { timeout: 30_000 });
    await expect(homework().getByTestId("attempt-submitter").first()).toContainText("@e2e.teacher (Teacher) on the student's behalf");
    await withDb(async (c) => {
      const rows = (await c.query(
        `SELECT r."submittedById" FROM "SubmissionRevision" r JOIN "Submission" s ON s.id = r."submissionId" JOIN "Assignment" a ON a.id = s."assignmentId"
         WHERE s."studentId" = $1 AND a.title = $2`, [studentId, names.assignment])).rows;
      expect(rows.map((r) => r.submittedById)).toEqual([teacherId]);
    });
  });

  test("the Administrator turns course homework off (reason required); the teacher no longer can", async () => {
    await admin.goto(`/admin/users/${teacherId}`);
    await card().getByTestId("teacher-homework-submission-revoke").click();
    await card().getByTestId("teacher-homework-submission-confirm").click();
    await expect(card()).toContainText("Give a reason of 3–500 characters.");   // a plain message: a reason first
    await card().getByTestId("teacher-homework-submission-reason").fill("Handed in homework for the wrong class");
    await card().getByTestId("teacher-homework-submission-confirm").click();
    await expect(card().getByTestId("teacher-homework-submission-state")).toContainText("Turned off");
    await expect(card().getByTestId("teacher-homework-submission-state")).toContainText("Handed in homework for the wrong class");

    // The teacher's page, on the next load: no homework and no hand-in; a plain message says why.
    await teacher.goto(`/teacher/students/${studentId}`);
    await expect(teacher.getByText("An administrator has turned off course homework for your students on your account")).toBeVisible({ timeout: 30_000 });
    await expect(teacher.getByTestId("teacher-assignment")).toHaveCount(0);
    // The backend refuses too.
    const token = await apiToken(teacher.request, "e2e.teacher", passwordOf("teacher"));
    const refused = await teacher.request.get(`/api/v1/teacher/students/${studentId}/progress`, { headers: { Authorization: `Bearer ${token}` } });
    expect(refused.status()).toBe(403);
    await withDb(async (c) => {
      const actions = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 AND action LIKE 'TEACHER_HOMEWORK_SUBMISSION_%' ORDER BY "createdAt"`, [teacherId])).rows.map((r) => r.action);
      expect(actions.at(-1)).toBe("TEACHER_HOMEWORK_SUBMISSION_REVOKED");
    });
  });

  test("turned back on: the teacher sees the student's homework again", async () => {
    await admin.goto(`/admin/users/${teacherId}`);
    await card().getByTestId("teacher-homework-submission-restore").click();
    await expect(card().getByTestId("teacher-homework-submission-state")).toContainText("Allowed");
    await teacher.goto(`/teacher/students/${studentId}`);
    await expect(homework()).toBeVisible({ timeout: 30_000 });
    await expect(homework().getByRole("button", { name: "Submit a new attempt" })).toBeVisible();
  });
});
