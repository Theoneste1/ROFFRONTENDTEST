/**
 * Question-level marking (design Rev 5.2, owner approval 2026-11-26), in a real browser against the real backend and
 * PostgreSQL (backend with QUESTION_MARKING_ENABLED=true):
 *  1. The subject's Head Coach switches the test to "By question", chooses coaches for each question, prepares the questions.
 *  2. Coach A takes paper X question 1: "You are marking Question 1 of 2", the WHOLE paper, blind; a mark above the
 *     maximum is refused in plain words; submits; the question leaves "To mark" and shows under "Marked by me".
 *  3. Coach A holds paper X question 2: coach B sees it as "Taken by another coach" (no name, no Take); a stale Take is
 *     refused with "Another coach took this question a moment ago"; coach B marks a different question at the same time.
 *  4. Staff release coach A's hold (reason): coach A's open page turns read only and says why.
 *  5. The Head Coach reviews: approves one question, asks for a second assessment of another; coach B (not the first
 *     marker) marks it; the Head Coach decides other marks with a reason (G4) — every step checked in the database.
 * Fixtures (synthetic, unique per run), as in test-marking.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { hashSync } from "bcryptjs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn, signInWith } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Question marking ${run}`;
const studentA = `e2e.qm.a.${run}`;
const studentB = `e2e.qm.b.${run}`;
const nameA = `Kaline${run}`;
const nameB = `Mugisha${run}`;
const coachB = `e2e.qm.coach.${run}`;
const coachBName = `Qmarker${run}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let testId: string;
let coachAId: string;
let coachBId: string;
let codeX = "";   // student A's paper
let codeY = "";   // student B's paper

async function apiToken(request: APIRequestContext, username: string, password: string) {
  for (let i = 0; i < 3; i++) {
    const r = await request.post("/api/v1/auth/login", { data: { username, password } });
    if (r.status() === 429) {
      test.info().setTimeout(test.info().timeout + 65_000);
      await new Promise((res) => setTimeout(res, 61_000));
      continue;
    }
    expect(r.status()).toBe(200);
    return (await r.json()).access_token as string;
  }
  throw new Error("sign-in kept being rate-limited");
}

async function noSeriousA11y(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const taskOf = (code: string, order: number) => withDb(async (c) => (await c.query(
  `SELECT t.id, t.status::text AS status, t."holderId", t."reservedForId" FROM "TestQuestionTask" t JOIN "TestSubmission" s ON s.id = t."submissionId"
     JOIN "TestQuestion" q ON q.id = t."questionId" WHERE s."publicCode" = $1 AND q."order" = $2 AND t.round = 'FIRST'`, [code, order])).rows[0]);

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
    const school = await createSchool(c, `E2E QM School ${run}`);
    await createStudent(c, studentA, nameA, school, "VERIFIED");
    await createStudent(c, studentB, nameB, school, "VERIFIED");
    coachAId = await idOf(c, "e2e.coach");
    coachBId = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'E2E', $3, 'MENTOR', $4, now(), true, now()) RETURNING id`,
      [coachB, coachBName, `${coachB}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
  });
  const auth = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const physics = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()).find((s: { code: string }) => s.code === "PHYSICS").id;
  for (const coachId of [coachAId, coachBId]) {
    const r = await request.post("/api/v1/admin/test-markers", { headers: auth, data: { coachId, subjectId: physics } });
    expect([201, 409]).toContain(r.status());
  }
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: physics, division: "ALL", answerFormat: "BOTH", maxMarks: 20,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "State Newton's second law.", maxMarks: 5 }, { prompt: "A 2 kg mass accelerates at 3 m/s². Find the force.", maxMarks: 15 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
  const a = { Authorization: `Bearer ${await apiToken(request, studentA, PASSWORD)}` };
  const key = crypto.randomUUID();
  expect((await request.post(`/api/v1/me/tests/${testId}/uploads/${key}/pages/1`, {
    headers: a, multipart: { file: { name: `IMG_3001 ${nameA}.png`, mimeType: "image/png", buffer: PNG } },
  })).status()).toBe(201);
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: a, data: { clientKey: key, typedAnswer: "F = ma; F = 6 N", pageCount: 1 } })).status()).toBe(201);
  const b = { Authorization: `Bearer ${await apiToken(request, studentB, PASSWORD)}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: b, data: { clientKey: crypto.randomUUID(), typedAnswer: "Force is mass times acceleration. 6 N." } })).status()).toBe(201);
  await withDb(async (c) => {
    await c.query(`UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]);
    const rows = (await c.query(`SELECT s."publicCode", u.username FROM "TestSubmission" s JOIN "User" u ON u.id = s."studentId" WHERE s."testId" = $1`, [testId])).rows;
    codeX = rows.find((r) => r.username === studentA).publicCode;
    codeY = rows.find((r) => r.username === studentB).publicCode;
  });
});

test.describe.serial("by question: Head Coach set-up → coaches mark one question at a time → review, second assessment, decide", () => {
  let head: Page;
  test.beforeAll(async ({ browser }) => {
    head = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(head, "headCoach");
  });
  test.afterAll(async () => head.context().close());

  test("Head Coach: switch to By question, coaches for each question, prepare the questions", async () => {
    await head.goto(`/mentor/tests/${testId}?tab=question-marking`);
    await expect(head.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    const panel = head.getByTestId("qm-panel");
    await expect(panel.getByTestId("qm-mode-value")).toHaveText("By paper");
    await panel.getByTestId("qm-switch-mode").click();
    await head.getByRole("dialog").getByRole("button", { name: "Mark by question" }).click();
    await expect(panel.getByTestId("qm-mode-value")).toHaveText("By question");
    for (const order of [1, 2]) {
      for (const label of [/Coach E2E/, new RegExp(coachBName)]) {
        await panel.getByTestId(`qm-add-select-q${order}`).selectOption({ label: (await panel.getByTestId(`qm-add-select-q${order}`).locator("option").filter({ hasText: label }).first().textContent())!.trim() });
        await panel.getByTestId(`qm-add-q${order}`).click();
        await expect(panel.getByTestId(`qm-markers-q${order}`)).toContainText(label);
      }
    }
    await noSeriousA11y(head);
    await panel.getByTestId("qm-generate").click();
    await expect(head.getByText("4 question(s) of 2 paper(s) are ready for the coaches.")).toBeVisible();
    await withDb(async (c) => {
      const n = (await c.query(`SELECT count(*)::int AS n FROM "TestQuestionTask" t JOIN "TestSubmission" s ON s.id = t."submissionId" WHERE s."testId" = $1 AND t.status = 'NOT_STARTED'`, [testId])).rows[0].n;
      expect(n).toBe(4);
      expect((await c.query(`SELECT "markingMode"::text AS m FROM "Test" WHERE id = $1`, [testId])).rows[0].m).toBe("QUESTION");
    });
  });

  test("coach A: takes paper X question 1, sees the whole paper (blind), marks only that question and submits", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(page, "coach");
    await navigateViaSidebar(page, "/mentor/marking");
    const queue = page.getByTestId("qm-queue");
    await expect(queue.getByTestId("qm-view-TO_MARK")).toHaveAttribute("aria-pressed", "true");
    await expect(queue.getByTestId(`qm-row-${codeX}-q1`)).toContainText("Available");
    await noSeriousA11y(page);
    await queue.getByTestId(`qm-take-${codeX}-q1`).click();
    await page.waitForURL(new RegExp(`/mentor/marking/q/${codeX}/q1$`));
    await expect(page.getByRole("heading", { name: "You are marking Question 1 of 2" })).toBeVisible();
    await expect(page.getByTestId("qm-question")).toContainText("State Newton's second law.");
    await expect(page.getByText("The whole answer paper")).toBeVisible();
    const text = await page.locator("main").innerText();
    for (const leak of [nameA, studentA, "E2E QM School", "IMG_3001"]) expect([leak, text.includes(leak)]).toEqual([leak, false]);
    await page.getByTestId("qm-marks").fill("6");
    await page.getByTestId("qm-submit").click();
    await expect(page.getByTestId("qm-marks").locator("xpath=..")).toContainText("This question is out of 5. Enter 5 or less.");
    await page.getByTestId("qm-quick-4").click();
    await page.getByTestId("qm-save").click();
    await expect(page.getByText("Your marks were saved as a draft.")).toBeVisible();
    await noSeriousA11y(page);
    await page.getByTestId("qm-submit").click();
    await expect(page.getByText(/^Submitted\. This question goes to the Head Coach/)).toBeVisible();
    expect((await taskOf(codeX, 1)).status).toBe("SUBMITTED");
    await navigateViaSidebar(page, "/mentor/marking");
    await expect(page.getByTestId(`qm-row-${codeX}-q1`)).toHaveCount(0);
    await page.getByTestId("qm-view-SUBMITTED").click();
    await expect(page.getByTestId(`qm-row-${codeX}-q1`)).toContainText("Marked by you");
    await page.reload();
    await expect(page.getByTestId("qm-view-SUBMITTED")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("qm-view-TO_MARK").click();
    await page.context().close();
  });

  test("one question of one paper, one coach: coach B sees A's question as taken; a stale Take is refused; B marks another at the same time", async ({ browser, request }) => {
    test.setTimeout(120_000);
    const pageB = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(pageB, coachB, PASSWORD);
    await navigateViaSidebar(pageB, "/mentor/marking");
    await expect(pageB.getByTestId(`qm-row-${codeX}-q2`)).toContainText("Available");
    // Coach A takes X question 2 while B's list is open.
    const ca = { Authorization: `Bearer ${await apiToken(request, "e2e.coach", PASSWORD)}` };
    expect((await request.post(`/api/v1/marking/tasks/${codeX}/q2/claim`, { headers: ca })).status()).toBe(200);
    await pageB.getByTestId(`qm-take-${codeX}-q2`).click();
    await expect(pageB.getByText("Another coach took this question a moment ago. Pick another one from the list.")).toBeVisible();
    await pageB.getByTestId("qm-view-ALL").click();
    await expect(pageB.getByTestId(`qm-row-${codeX}-q2`)).toContainText("Taken by another coach");
    await expect(pageB.getByTestId(`qm-take-${codeX}-q2`)).toHaveCount(0);
    expect(await pageB.locator("main").innerText()).not.toContain("Coach E2E");
    expect((await taskOf(codeX, 2)).holderId).toBe(coachAId);
    // Meanwhile B marks paper X question 1? No: it is submitted. B takes paper Y question 2 (a different question, a different paper).
    await pageB.getByTestId("qm-view-TO_MARK").click();
    await pageB.getByTestId(`qm-take-${codeY}-q2`).click();
    await pageB.waitForURL(new RegExp(`/mentor/marking/q/${codeY}/q2$`));
    await pageB.getByTestId("qm-marks").fill("12");
    await pageB.getByTestId("qm-submit").click();
    await expect(pageB.getByText(/^Submitted\./)).toBeVisible();
    await pageB.context().close();
  });

  test("staff release coach A's hold: A's open page turns read only and says why", async ({ browser, request }) => {
    const pageA = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(pageA, "coach");
    await pageA.goto(`/mentor/marking/q/${codeX}/q2`);
    await expect(pageA.getByRole("heading", { name: "You are marking Question 2 of 2" })).toBeVisible({ timeout: 30_000 });
    await pageA.getByTestId("qm-marks").fill("10");
    const hc = { Authorization: `Bearer ${await apiToken(request, "e2e.head", PASSWORD)}` };
    const t = await taskOf(codeX, 2);
    expect((await request.post(`/api/v1/admin/tests/${testId}/question-marking/tasks/${t.id}/release`, { headers: hc, data: { reason: "Coach called away" } })).status()).toBe(200);
    await pageA.getByTestId("qm-save").click();
    await expect(pageA.getByTestId("qm-lost")).toHaveText(/The Head Coach or an administrator released this question from you/);
    await expect(pageA.getByTestId("qm-form")).toHaveCount(0);
    await expect(pageA.getByTestId("qm-readonly")).toBeVisible();
    expect((await taskOf(codeX, 2)).status).toBe("NOT_STARTED");
    await pageA.context().close();
  });

  test("Head Coach: approve one question; second assessment of another by coach B; decide other marks with a reason", async ({ browser }) => {
    test.setTimeout(180_000);
    const panel = head.getByTestId("qm-panel");
    await head.reload();
    await expect(panel.getByTestId("qm-tasks")).toBeVisible({ timeout: 30_000 });
    // Awaiting review: X q1 (coach A, 4) and Y q2 (coach B, 12).
    await panel.getByTestId(`qm-open-task-${codeY}-q2`).click();
    const review = head.getByTestId("qm-review");
    await expect(review).toContainText(nameB);   // staff are not blind
    await expect(review.getByTestId("qm-assessment")).toContainText("12");
    await review.getByTestId("qm-approve").click();
    await expect(head.getByText("Approved.")).toBeVisible();
    await expect(review.getByTestId("qm-task-status").first()).toHaveText("Approved");
    await head.getByRole("button", { name: "Close" }).first().click();
    await panel.getByTestId(`qm-open-task-${codeX}-q1`).click();
    await review.getByTestId("qm-second").click();
    await head.getByTestId("qm-second-coach").selectOption({ label: `${coachBName} E2E` });
    await head.getByTestId("qm-second-confirm").click();
    await expect(head.getByText("A second assessment was requested.")).toBeVisible();
    await noSeriousA11y(head);
    await head.getByRole("button", { name: "Close" }).first().click();
    // Coach B marks the second assessment: the first marks are nowhere on the page.
    const pageB = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(pageB, coachB, PASSWORD);
    await pageB.goto(`/mentor/marking/q/${codeX}/q1-s1`);
    await expect(pageB.getByRole("heading", { name: /You are marking Question 1 · second assessment of 2/ })).toBeVisible({ timeout: 30_000 });
    const text = await pageB.locator("main").innerText();
    for (const leak of ["4 / 5", "Coach E2E", nameA]) expect([leak, text.includes(leak)]).toEqual([leak, false]);
    await pageB.getByTestId("qm-quick-2").click();
    await pageB.getByTestId("qm-submit").click();
    await expect(pageB.getByText(/^Submitted\./)).toBeVisible();
    await pageB.context().close();
    // The Head Coach decides other marks (3) with a reason.
    await head.reload();
    await panel.getByTestId("qm-status-filter").selectOption("AWAITING_SECOND");
    await panel.getByTestId(`qm-open-task-${codeX}-q1`).click();
    await review.getByTestId("qm-decide").click();
    await head.getByTestId("qm-decide-adjusted").check();
    await head.getByTestId("qm-decide-marks").fill("3");
    await head.getByRole("dialog").last().getByLabel("Reason").fill("Partly right: law stated without units");
    await head.getByTestId("qm-decide-confirm").click();
    await expect(head.getByText("The marks were decided and the question approved.")).toBeVisible();
    await withDb(async (c) => {
      const d = (await c.query(
        `SELECT d.marks, d.source::text AS source, d.reason FROM "TestQuestionDecision" d JOIN "TestQuestionTask" t ON t.id = d."taskId"
           JOIN "TestSubmission" s ON s.id = t."submissionId" JOIN "TestQuestion" q ON q.id = t."questionId"
          WHERE s."publicCode" = $1 AND q."order" = 1 AND d."supersededAt" IS NULL`, [codeX])).rows;
      expect(d).toEqual([{ marks: 3, source: "ADJUSTED", reason: "Partly right: law stated without units" }]);
      expect((await taskOf(codeX, 1)).status).toBe("APPROVED");
    });
  });
});
