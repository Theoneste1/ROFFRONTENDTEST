/**
 * Question-level marking on a phone (Pixel 7): the coach's "By question" list as cards, taking a question, the
 * workspace (the question, the whole paper, the marks with quick buttons) without horizontal scrolling, and submitting.
 * Backend with QUESTION_MARKING_ENABLED=true. Fixtures synthetic and unique per run.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const student = `e2e.qmm.${run}`;
let testId = "";
let code = "";

async function token(request: APIRequestContext, username: string, password: string) {
  const r = await request.post("/api/v1/auth/login", { data: { username, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token as string;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  let coachId = "";
  await withDb(async (c) => {
    const school = await createSchool(c, `E2E QM Phone School ${run}`);
    await createStudent(c, student, `Phone${run}`, school, "VERIFIED");
    coachId = await idOf(c, "e2e.coach");
  });
  const auth = { Authorization: `Bearer ${await token(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const physics = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()).find((s: { code: string }) => s.code === "PHYSICS").id;
  expect([201, 409]).toContain((await request.post("/api/v1/admin/test-markers", { headers: auth, data: { coachId, subjectId: physics } })).status());
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title: `E2E QM phone ${run}`, subjectId: physics, division: "ALL", answerFormat: "BOTH", maxMarks: 10,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "Define velocity.", maxMarks: 4 }, { prompt: "Define acceleration.", maxMarks: 6 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
  const s = { Authorization: `Bearer ${await token(request, student, PASSWORD)}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: s, data: { clientKey: crypto.randomUUID(), typedAnswer: "Speed with direction." } })).status()).toBe(201);
  await withDb((c) => c.query(`UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]));
  const q = `/api/v1/admin/tests/${testId}/question-marking`;
  expect((await request.patch(`${q}/mode`, { headers: auth, data: { mode: "QUESTION" } })).status()).toBe(200);
  const markers = await (await request.get(`${q}/markers`, { headers: auth })).json();
  for (const question of markers.questions) {
    expect((await request.put(`${q}/questions/${question.id}/markers`, { headers: auth, data: { add: [coachId] } })).status()).toBe(200);
  }
  expect((await request.post(`${q}/tasks/generate`, { headers: auth })).status()).toBe(200);
  code = (await withDb((c) => c.query(`SELECT "publicCode" FROM "TestSubmission" WHERE "testId" = $1`, [testId]))).rows[0].publicCode;
});

test("a coach on a phone takes a question from the cards, marks it with the quick buttons and submits", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "coach");
  await page.goto("/mentor/marking");
  const card = page.getByTestId(`qm-card-${code}-q1`);
  await expect(card).toContainText("Question 1 · out of 4", { timeout: 30_000 });
  await card.getByTestId(`qm-take-${code}-q1`).click();
  await page.waitForURL(new RegExp(`/mentor/marking/q/${code}/q1$`));
  await expect(page.getByRole("heading", { name: "You are marking Question 1 of 2" })).toBeVisible();
  await expect(page.getByTestId("qm-question")).toContainText("Define velocity.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("qm-quick-3").click();
  await expect(page.getByTestId("qm-marks")).toHaveValue("3");
  await page.getByTestId("qm-submit").click();
  await expect(page.getByText(/^Submitted\./)).toBeVisible();
  await withDb(async (c) => {
    const r = (await c.query(
      `SELECT t.status::text AS status, a.marks FROM "TestQuestionTask" t JOIN "TestSubmission" s ON s.id = t."submissionId" JOIN "TestQuestion" q ON q.id = t."questionId"
         JOIN "TestQuestionAssessment" a ON a."taskId" = t.id AND a.status = 'SUBMITTED' WHERE s."publicCode" = $1 AND q."order" = 1`, [code])).rows;
    expect(r).toEqual([{ status: "SUBMITTED", marks: 3 }]);
  });
});
