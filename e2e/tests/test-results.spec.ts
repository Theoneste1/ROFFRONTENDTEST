/**
 * Test Management, Phase 4 (owner-approved plan 2026-11-19), in a real browser against the real backend and PostgreSQL:
 *  1. The subject's Head Coach opens Publishing: one result is not approved → publishing is BLOCKED, and there is no
 *     override control for a Head Coach.
 *  2. An Administrator overrides with a mandatory reason (refused empty): only the two approved results are published;
 *     the publication, the override reason and the audit entries are checked in the database.
 *  3. The student sees their own result (marks per question, total, comments) and never a rank; the unapproved student
 *     sees "not published"; the teacher sees their school's published results by name, never ranked.
 *  4. Results (report) and Rankings tabs for the Administrator and the Head Coach.
 *  5. The last result is approved and published by the Head Coach; then a published result is unlocked (G6): it
 *     disappears from the student's view; re-approved and republished, it is back.
 *  6. Dashboard widgets per role.
 * Fixtures (synthetic, unique per run): the e2e Head Coach heads Physics; e2e.coach is authorised to mark Physics; three
 * students and a teacher of a school of this run; a Physics test answered by the three, closed, marked by e2e.coach.
 */
import AxeBuilder from "@axe-core/playwright";
import { hashSync } from "bcryptjs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn, signInWith } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Results round ${run}`;
const school = `E2E Results School ${run}`;
const [stA, stB, stC] = ["a", "b", "c"].map((x) => `e2e.rs.${x}.${run}`);
const [nameA, nameB, nameC] = [`Amani${run}`, `Bella${run}`, `Cedric${run}`];
const teacher = `e2e.rs.t.${run}`;

let testId: string;
let ids: Record<string, string> = {};

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

const subOf = (studentId: string) => withDb(async (c) => (await c.query(
  `SELECT id, "publicCode", status FROM "TestSubmission" WHERE "testId" = $1 AND "studentId" = $2`, [testId, studentId])).rows[0]);

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000);
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
    const sid = await createSchool(c, school);
    ids = {
      a: await createStudent(c, stA, nameA, sid, "VERIFIED"),
      b: await createStudent(c, stB, nameB, sid, "VERIFIED"),
      c: await createStudent(c, stC, nameC, sid, "VERIFIED"),
      coach: await idOf(c, "e2e.coach"),
    };
    ids.teacher = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Tess', $2, $3, 'TEACHER', $4, now(), true, now()) RETURNING id`,
      [teacher, `Teacher${run}`, `${teacher}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    await assignTeacherSchool(c, ids.teacher, sid);
  });
  const admin = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const physics = (await (await request.get("/api/v1/admin/tests/subjects", { headers: admin })).json()).find((s: { code: string }) => s.code === "PHYSICS").id;
  expect([201, 409]).toContain((await request.post("/api/v1/admin/test-markers", { headers: admin, data: { coachId: ids.coach, subjectId: physics } })).status());
  const created = await request.post("/api/v1/admin/tests", {
    headers: admin,
    data: {
      title, subjectId: physics, division: "ALL", answerFormat: "BOTH", maxMarks: 20,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "State Ohm's law.", maxMarks: 5 }, { prompt: "Find the current through a 4 ohm resistor at 12 V.", maxMarks: 15 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: admin })).status()).toBe(200);
  for (const [u, text] of [[stA, "V = IR"], [stB, "I = 3 A"], [stC, "I = 2 A"]] as const) {
    const h = { Authorization: `Bearer ${await apiToken(request, u, PASSWORD)}` };
    expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: h, data: { clientKey: crypto.randomUUID(), typedAnswer: text } })).status()).toBe(201);
  }
  await withDb((c) => c.query(
    `UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]));
  const hc = { Authorization: `Bearer ${await apiToken(request, "e2e.head", PASSWORD)}` };
  expect((await request.post(`/api/v1/admin/tests/${testId}/marking/distribute`, { headers: hc, data: { coachIds: [ids.coach] } })).status()).toBe(200);
  const q = await withDb(async (c) => (await c.query(`SELECT id FROM "TestQuestion" WHERE "testId" = $1 ORDER BY "order"`, [testId])).rows.map((r) => r.id as string));
  const coach = { Authorization: `Bearer ${await apiToken(request, "e2e.coach", PASSWORD)}` };
  const marks: Record<string, [number, number, string | null]> = { a: [4, 13, "Units missing"], b: [5, 10, null], c: [5, 12, null] };
  for (const k of ["a", "b", "c"]) {
    const code = (await subOf(ids[k])).publicCode;
    const body = { scores: [{ questionId: q[0], marks: marks[k][0], comment: marks[k][2] }, { questionId: q[1], marks: marks[k][1] }], comment: k === "a" ? "Clear working" : null };
    expect((await request.put(`/api/v1/marking/submissions/${code}/marking`, { headers: coach, data: body })).status()).toBe(200);
    expect((await request.post(`/api/v1/marking/submissions/${code}/marking/submit`, { headers: coach, data: body })).status()).toBe(200);
  }
  for (const k of ["a", "b"]) {
    expect((await request.post(`/api/v1/admin/tests/${testId}/marking/submissions/${(await subOf(ids[k])).id}/approve`, { headers: hc, data: {} })).status()).toBe(200);
  }
});

test.describe.serial("publication, results, rankings, withdrawal (G6)", () => {
  let head: Page;
  let admin: Page;
  test.beforeAll(async ({ browser }) => {
    head = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(head, "headCoach");
    admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(admin, "admin");
  });
  test.afterAll(async () => { await head.context().close(); await admin.context().close(); });

  test("Head Coach: one result not approved → publishing is blocked, and no override is offered", async () => {
    await head.goto(`/mentor/tests/${testId}?tab=publishing`);
    const panel = head.getByTestId("publishing-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId("count-approved")).toHaveText("2");
    await expect(panel.getByTestId("count-unapproved")).toHaveText("1");
    await expect(panel.getByTestId("publication-blocked")).toContainText("only an Administrator can override");
    await expect(panel.getByTestId("unapproved-rows")).toContainText(nameC);
    await expect(panel.getByTestId("publish-results")).toHaveCount(0);
    await expect(panel.getByTestId("override-publish")).toHaveCount(0);
    await noSeriousA11y(head);
  });

  test("Administrator: override with a mandatory reason publishes the approved results only (audited)", async () => {
    await admin.goto(`/admin/tests/${testId}`);
    await expect(admin.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    await admin.getByTestId("tab-publishing").click();
    const panel = admin.getByTestId("publishing-panel");
    await panel.getByTestId("override-publish").click();
    const form = admin.getByTestId("override-form");
    await form.getByTestId("override-confirm").click();
    await expect(form.getByText("Give the reason for publishing although some results are not approved.")).toBeVisible();
    await form.getByTestId("override-reason").fill("short");
    await form.getByTestId("override-confirm").click();
    await expect(form.getByText("At least 10 characters.")).toBeVisible();
    await noSeriousA11y(admin);
    await form.getByTestId("override-reason").fill("Prize ceremony on Friday; one script still in review");
    await form.getByTestId("override-confirm").click();
    await expect(admin.getByText(/Published 2 results \(publication 1\)/)).toBeVisible();
    await expect(panel.getByTestId("count-published")).toHaveText("2");
    await expect(panel.getByTestId("publication-rows")).toContainText("Prize ceremony on Friday");
    await withDb(async (c) => {
      const pubs = (await c.query(`SELECT override, "overrideReason", "publishedCount", "actorRole" FROM "TestPublication" WHERE "testId" = $1`, [testId])).rows;
      expect(pubs).toEqual([{ override: true, overrideReason: "Prize ceremony on Friday; one script still in review", publishedCount: 2, actorRole: "ADMIN" }]);
      const statuses = (await c.query(`SELECT u.username, s.status FROM "TestSubmission" s JOIN "User" u ON u.id = s."studentId" WHERE s."testId" = $1 ORDER BY u.username`, [testId])).rows;
      expect(statuses.map((r) => r.status)).toEqual(["PUBLISHED", "PUBLISHED", "MARKED"]);
      const audit = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 AND action IN ('TEST_RESULTS_PUBLISHED', 'TEST_PUBLICATION_OVERRIDDEN') ORDER BY action`, [testId])).rows.map((r) => r.action);
      expect(audit).toEqual(["TEST_PUBLICATION_OVERRIDDEN", "TEST_RESULTS_PUBLISHED"]);
    });
  });

  test("Results (report) and Rankings for the Administrator; Rankings for the Head Coach", async () => {
    await admin.getByTestId("tab-results").click();
    const results = admin.getByTestId("results-panel");
    await expect(results.getByTestId("report-results")).toHaveText("2");
    await expect(results.getByTestId("report-average")).toHaveText("16");
    await expect(results.getByTestId("result-rows")).toContainText(nameA);
    await expect(results.getByTestId("by-school")).toContainText(school);
    await noSeriousA11y(admin);
    await admin.getByTestId("tab-rankings").click();
    const ranks = admin.getByTestId("rankings-panel");
    await expect(ranks.getByTestId(`ranking-${ids.a}`).getByTestId("rank")).toHaveText("1");
    await expect(ranks.getByTestId(`ranking-${ids.b}`).getByTestId("rank")).toHaveText("2");
    await ranks.getByRole("button", { name: "By school" }).click();
    await expect(ranks.getByTestId("ranking-rows")).toContainText(school);
    await noSeriousA11y(admin);
    await head.getByTestId("tab-rankings").click();
    await expect(head.getByTestId("rankings-panel").getByTestId(`ranking-${ids.a}`)).toContainText("17 / 20");
  });

  test("the student sees their own result — marks per question, comments, total — and never a rank", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(page, stA, PASSWORD);
    await navigateViaSidebar(page, "/student/results");
    await expect(page.getByRole("heading", { name: "My results", level: 1 })).toBeVisible();
    await expect(page.getByTestId(`my-result-${testId}`)).toContainText("17 / 20");
    await noSeriousA11y(page);
    await page.getByTestId(`my-result-${testId}`).click();
    await page.waitForURL(new RegExp(`/student/results/${testId}$`));
    await expect(page.getByTestId("result-total")).toHaveText("17 / 20");
    await expect(page.getByTestId("result-q1")).toContainText("4 / 5");
    await expect(page.getByTestId("result-q1")).toContainText("Units missing");
    await expect(page.getByTestId("result-comment")).toHaveText("Clear working");
    const text = await page.locator("main").innerText();
    for (const leak of [nameB, nameC, "Rank", "rank", "Coach E2E", "e2e.coach"]) expect([leak, text.includes(leak)]).toEqual([leak, false]);
    await noSeriousA11y(page);
    await page.context().close();
  });

  test("the unapproved student sees nothing published; the teacher sees the school's published results by name, never ranked", async ({ browser }) => {
    const c = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(c, stC, PASSWORD);
    await c.goto(`/student/results/${testId}`);
    await expect(c.getByTestId("result-not-published")).toBeVisible({ timeout: 30_000 });
    await c.context().close();
    const t = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(t, teacher, PASSWORD);
    await navigateViaSidebar(t, "/teacher/results");
    await t.getByTestId(`school-test-${testId}`).click();
    await t.waitForURL(new RegExp(`/teacher/results/${testId}$`));
    const rows = t.getByTestId("school-results");
    await expect(rows.getByTestId(`school-result-${ids.a}`)).toContainText("17 / 20");
    await expect(rows.getByTestId(`school-result-${ids.b}`)).toContainText("15 / 20");
    await expect(rows).not.toContainText(nameC);
    expect((await t.locator("main").innerText()).toLowerCase()).not.toContain("rank");
    await noSeriousA11y(t);
    await rows.getByTestId(`school-result-${ids.b}`).getByRole("link").click();
    await expect(t.getByTestId("result-total")).toHaveText("15 / 20");
    await t.context().close();
  });

  test("the Head Coach publishes the last result once approved; then unlocking a published result withdraws it (G6); republishing restores it", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const hc = { Authorization: `Bearer ${await apiToken(request, "e2e.head", PASSWORD)}` };
    expect((await request.post(`/api/v1/admin/tests/${testId}/marking/submissions/${(await subOf(ids.c)).id}/approve`, { headers: hc, data: {} })).status()).toBe(200);
    await head.goto(`/mentor/tests/${testId}?tab=publishing`);
    const panel = head.getByTestId("publishing-panel");
    await panel.getByTestId("publish-results").click();
    await expect(head.getByText(/Published 1 result \(publication 2\)/)).toBeVisible();
    // Unlock A's published result: it is withdrawn.
    await head.getByTestId("tab-review").click();
    await head.getByTestId("review-panel").getByRole("button", { name: "Published" }).click();
    await head.getByTestId(`review-${stA}`).getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await expect(detail).toContainText("Unlocking it (with a reason) withdraws it");
    await detail.getByTestId("action-unlock").click();
    const unlock = head.getByTestId("decision-unlock");
    await expect(head.getByRole("dialog", { name: /Unlock and withdraw this published result/ })).toBeVisible();
    await unlock.getByTestId("decision-text").fill("Question 2 re-check requested");
    await unlock.getByTestId("decision-confirm").click();
    await expect(head.getByText(/Unlocked and withdrawn/)).toBeVisible();
    const student = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(student, stA, PASSWORD);
    await student.goto(`/student/results/${testId}`);
    await expect(student.getByTestId("result-not-published")).toBeVisible({ timeout: 30_000 });
    await withDb(async (c) => {
      const w = (await c.query(`SELECT reason FROM "TestResultWithdrawal" w JOIN "TestSubmission" s ON s.id = w."submissionId" WHERE s."testId" = $1`, [testId])).rows;
      expect(w).toEqual([{ reason: "Question 2 re-check requested" }]);
      const n = (await c.query(`SELECT count(*)::int AS n FROM "NotificationOutbox" WHERE type = 'test.result.withdrawn' AND "recipientUserId" = $1`, [ids.a])).rows[0].n;
      expect(n).toBe(1);
    });
    // Re-approved: still hidden until published again.
    await detail.getByTestId("action-approve").click();
    await head.getByTestId("decision-approve").getByTestId("decision-confirm").click();
    await expect(head.getByText("Approved: the result is locked.")).toBeVisible();
    await head.getByRole("button", { name: "Close" }).click();
    await student.reload();
    await expect(student.getByTestId("result-not-published")).toBeVisible({ timeout: 30_000 });
    await head.getByTestId("tab-publishing").click();
    await head.getByTestId("publishing-panel").getByTestId("publish-results").click();
    await expect(head.getByText(/Published 1 result \(publication 3\)/)).toBeVisible();
    await expect(head.getByTestId("withdrawals")).toContainText("Question 2 re-check requested");
    await student.reload();
    await expect(student.getByTestId("result-total")).toHaveText("17 / 20", { timeout: 30_000 });
    await student.context().close();
  });

  test("dashboard widgets: Administrator, Head Coach, coach, teacher and student", async ({ browser }) => {
    test.setTimeout(180_000);
    await admin.goto("/admin/dashboard");
    await expect(admin.getByTestId("tests-widget-staff")).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByTestId("tests-widget-staff").getByTestId("subject-PHYSICS")).toBeVisible();
    await noSeriousA11y(admin);
    await head.goto("/mentor/dashboard");
    const hw = head.getByTestId("tests-widget-staff");
    await expect(hw).toBeVisible({ timeout: 30_000 });
    await expect(hw.getByTestId("subject-PHYSICS")).toBeVisible();
    await expect(hw.getByTestId("subject-MATHEMATICS")).toHaveCount(0);
    const coach = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(coach, "coach");
    await coach.goto("/mentor/dashboard");
    await expect(coach.getByTestId("tests-widget-coach")).toBeVisible({ timeout: 30_000 });
    await expect(coach.getByTestId("tests-widget-staff")).toHaveCount(0);
    await noSeriousA11y(coach);
    await coach.context().close();
    const t = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(t, teacher, PASSWORD);
    await t.goto("/teacher/dashboard");
    await expect(t.getByTestId("teacher-widget-results")).toContainText(title, { timeout: 30_000 });
    await noSeriousA11y(t);
    await t.context().close();
    const s = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(s, stB, PASSWORD);
    await s.goto("/student/dashboard");
    await expect(s.getByTestId("student-widget-results")).toContainText(title, { timeout: 30_000 });
    await expect(s.getByTestId("student-results-count")).toHaveText("1");
    await s.context().close();
  });

  test("Test reports: the Administrator's and the Head Coach's overview link to the test", async () => {
    // Linked from the Tests page (and the dashboard widget).
    await navigateViaSidebar(admin, "/admin/tests");
    await admin.getByTestId("test-reports-link").click();
    await admin.waitForURL(/\/admin\/test-reports$/);
    await admin.getByLabel("Search tests").fill(title);
    await expect(admin.getByTestId(`report-${testId}`)).toContainText("3", { timeout: 30_000 });
    await noSeriousA11y(admin);
    await head.goto("/mentor/dashboard");
    await head.getByTestId("widget-test-reports").click();
    await head.waitForURL(/\/mentor\/test-reports$/);
    await head.getByLabel("Search tests").fill(title);
    await head.getByTestId(`report-${testId}`).getByRole("link", { name: title, exact: true }).click();
    await head.waitForURL(new RegExp(`/mentor/tests/${testId}\\?tab=results$`));
    await expect(head.getByTestId("results-panel")).toBeVisible({ timeout: 30_000 });
  });
});
