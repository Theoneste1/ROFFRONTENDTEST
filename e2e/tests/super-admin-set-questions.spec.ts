/**
 * Owner 2026-11-27: a test created without questions (marked as one total) that already has papers — a Super Administrator
 * sets its questions on the Questions tab (reason required; students' answers untouched), so it can be marked by question.
 * An Administrator does not get the action.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Set questions ${run}`;
const student = `e2e.setq.${run}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let testId: string;

async function token(request: APIRequestContext, username: string, password: string) {
  const r = await request.post("/api/v1/auth/login", { data: { username, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token as string;
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await withDb(async (c) => {
    const school = await createSchool(c, `E2E SetQ School ${run}`);
    await createStudent(c, student, `Setq${run}`, school, "VERIFIED");
  });
  const auth = { Authorization: `Bearer ${await token(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const physics = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()).find((s: { code: string }) => s.code === "PHYSICS").id;
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: physics, division: "ALL", answerFormat: "BOTH", maxMarks: 20,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.put(`/api/v1/admin/tests/${testId}/files/paper`, { headers: auth, multipart: { file: { name: "paper.pdf", mimeType: "application/pdf", buffer: PDF } } })).status()).toBe(200);
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
  const s = { Authorization: `Bearer ${await token(request, student, PASSWORD)}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: s, data: { clientKey: crypto.randomUUID(), typedAnswer: "My answers" } })).status()).toBe(201);
});

test("Administrator: a test with papers keeps its questions locked; no Super Administrator action", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto(`/admin/tests/${testId}`);
  await page.getByRole("tab", { name: /Questions/ }).click();
  await expect(page.getByText("No questions. The test is marked as one total.")).toBeVisible();
  await expect(page.getByTestId("super-admin-questions")).toHaveCount(0);
  await expect(page.getByTestId("add-question")).toBeVisible();
});

test("Super Administrator: sets the questions of a test that already has papers; the answer is untouched", async ({ page }) => {
  await signIn(page, "superAdmin");
  await page.goto(`/admin/tests/${testId}`);
  await page.getByRole("tab", { name: /Questions/ }).click();
  await expect(page.getByTestId("super-admin-questions")).toBeVisible();
  await expect(page.getByTestId("add-question")).toHaveCount(0);
  await page.getByTestId("set-questions").click();
  const form = page.getByTestId("set-questions-form");
  await expect(form).toContainText("1 student has submitted");

  // Marks that do not add up, and a missing reason, are explained before anything is sent.
  await form.getByLabel("Question 1 marks").fill("8");
  await page.getByTestId("set-questions-save").click();
  await expect(form.getByRole("alert")).toContainText("must add up to the test's 20 marks");
  await page.getByTestId("set-questions-add").click();
  await form.getByLabel("Question 2 marks").fill("12");
  await expect(page.getByTestId("set-questions-total")).toHaveText("Total 20 of 20 marks");
  await page.getByTestId("set-questions-save").click();
  await expect(form.getByRole("alert")).toContainText("Give the reason");
  await form.getByLabel("Reason (kept in the audit log)").fill("Created without its questions; marked by question");
  await page.getByTestId("set-questions-save").click();

  await expect(page.getByText("The questions were set. The students' answers were not changed.")).toBeVisible();
  await expect(page.getByTestId("question-1")).toContainText("8 marks");
  await expect(page.getByTestId("question-2")).toContainText("12 marks");
  const answer = await withDb(async (c) => (await c.query(
    `SELECT s.status::text AS status, v."typedAnswer" FROM "TestSubmission" s JOIN "TestSubmissionVersion" v ON v.id = s."currentVersionId" WHERE s."testId" = $1`, [testId])).rows[0]);
  expect(answer).toEqual({ status: "SUBMITTED", typedAnswer: "My answers" });
});
