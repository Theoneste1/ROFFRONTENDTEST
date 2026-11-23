/**
 * Owner 2026-11-23: a teacher also submits test answers for the students ASSIGNED to them — here a student of another
 * school, assigned by an Administrator with a reason — in a real browser against the real backend and PostgreSQL.
 * The assigned student is listed with the teacher's own students, the page says so, the teacher submits a typed answer,
 * and the stored version names the teacher. Fixtures are synthetic and unique per run.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Assigned round ${run}`;
const assignedUser = `e2e.as.${run}`;
const assignedName = `Gaby${run}`;
let testId: string;
let assignedId: string;

async function apiToken(request: APIRequestContext, username: string, password: string) {
  const r = await request.post("/api/v1/auth/login", { data: { username, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token as string;
}

test.beforeAll(async ({ request }) => {
  await withDb(async (c) => {
    // A student of a school the teacher has no link to, assigned to the teacher by an Administrator with a reason.
    const elsewhere = await createSchool(c, `E2E Elsewhere School ${run}`);
    assignedId = await createStudent(c, assignedUser, assignedName, elsewhere, "VERIFIED");
    await c.query(
      `INSERT INTO "TeacherStudentAssignment" (id, "teacherId", "studentId", "crossSchool", reason, "assignedById", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, true, 'Weekend coaching group', $3, now())`,
      [await idOf(c, "e2e.teacher"), assignedId, await idOf(c, "admin")],
    );
  });
  const token = await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!");
  const auth = { Authorization: `Bearer ${token}` };
  const subjects = await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json();
  const maths = subjects.find((s: { code: string }) => s.code === "MATHEMATICS").id;
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: maths, division: "JUNIOR", answerFormat: "BOTH", maxMarks: 10,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      questions: [{ prompt: "How many primes are below 20?", maxMarks: 10 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
});

test("the teacher submits for a student assigned to them from another school", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "teacher");
  await navigateViaSidebar(page, "/teacher/tests");
  await expect(page.getByText("the students assigned to you").first()).toBeVisible();
  await page.getByTestId(`teacher-test-${testId}`).getByRole("link", { name: /Students for/ }).click();
  await page.waitForURL(new RegExp(`/teacher/tests/${testId}$`));
  const row = page.getByTestId(`student-row-${assignedUser}`);
  await expect(row).toContainText("Not yet");
  await expect(row).toContainText(`E2E Elsewhere School ${run}`);
  await row.getByRole("link", { name: /^Submit for/ }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Answer for ${assignedName}`) })).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("typed-answer").fill("Eight: 2, 3, 5, 7, 11, 13, 17, 19.");
  await page.getByTestId("submit-answer").click();
  await expect(page.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("version-1")).toContainText("(teacher)");
  await withDb(async (c) => {
    const teacherId = await idOf(c, "e2e.teacher");
    const v = (await c.query(
      `SELECT v."submitterRole", v."submittedById", v."teacherId" FROM "TestSubmissionVersion" v JOIN "TestSubmission" s ON s.id = v."submissionId"
        WHERE s."testId" = $1 AND s."studentId" = $2`, [testId, assignedId])).rows;
    expect(v).toEqual([{ submitterRole: "TEACHER", submittedById: teacherId, teacherId }]);
  });
});
