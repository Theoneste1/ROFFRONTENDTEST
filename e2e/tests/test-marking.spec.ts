/**
 * Test Management, Phase 3 (owner-approved plan 2026-11-19), in a real browser against the real backend and PostgreSQL:
 *  1. The subject's Head Coach distributes the submissions evenly between two authorised coaches (Markers & distribution).
 *  2. Coach A marks BLIND (only a code; no name, school or extension anywhere on the page), saves a draft, submits.
 *  3. The Head Coach requests a second marking by coach B (Review).
 *  4. Coach B marks independently — the first marks are nowhere on the page — and submits.
 *  5. The Head Coach compares them side by side, adjusts the mark (reason), approves (locked), then unlocks (reason);
 *     the History tab shows the mark change. Every step is checked in the database (decisions, statuses, audit).
 * Fixtures (synthetic, unique per run): the e2e Head Coach heads Physics; e2e.coach and a second coach of this run are
 * authorised to mark Physics; two students of a school of this run answer a Physics test that has then closed.
 */
import AxeBuilder from "@axe-core/playwright";
import { hashSync } from "bcryptjs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn, signInWith } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Marking round ${run}`;
const studentA = `e2e.mk.a.${run}`;
const studentB = `e2e.mk.b.${run}`;
const nameA = `Aline${run}`;
const nameB = `Bosco${run}`;
const coachB = `e2e.mk.coach.${run}`;
const coachBName = `Marker${run}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let testId: string;
let coachAId: string;
let coachBId: string;
/** The submission coach A marks, and its student. */
let code = "";
let markedStudent = "";
let markedName = "";

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

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
    const school = await createSchool(c, `E2E Marking School ${run}`);
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
    expect([201, 409]).toContain(r.status());   // 409: already authorised by an earlier run
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
  expect((await request.put(`/api/v1/admin/tests/${testId}/files/marking-guide`, {
    headers: auth, multipart: { file: { name: "Guide by Mr Kamali.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") } },
  })).status()).toBe(200);
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
  // Both students answer: A with a photo page, B typed.
  const a = { Authorization: `Bearer ${await apiToken(request, studentA, PASSWORD)}` };
  const key = crypto.randomUUID();
  expect((await request.post(`/api/v1/me/tests/${testId}/uploads/${key}/pages/1`, {
    headers: a, multipart: { file: { name: `IMG_2001 ${nameA}.png`, mimeType: "image/png", buffer: PNG } },
  })).status()).toBe(201);
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: a, data: { clientKey: key, typedAnswer: "F = ma", pageCount: 1 } })).status()).toBe(201);
  const b = { Authorization: `Bearer ${await apiToken(request, studentB, PASSWORD)}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: b, data: { clientKey: crypto.randomUUID(), typedAnswer: "F = 6 N" } })).status()).toBe(201);
  // The deadline passes (database time).
  await withDb((c) => c.query(
    `UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]));
});

test.describe.serial("Head Coach → coach A (blind) → second marking by coach B → adjust, approve, unlock", () => {
  let head: Page;
  test.beforeAll(async ({ browser }) => {
    head = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();   // a context of its own (axe needs one)
    await signIn(head, "headCoach");
  });
  test.afterAll(async () => head.context().close());

  test("Markers & distribution: the Head Coach distributes evenly between the two authorised coaches", async () => {
    await head.goto(`/mentor/tests/${testId}`);
    await expect(head.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    await head.getByTestId("tab-markers").click();
    const panel = head.getByTestId("distribution-panel");
    await expect(panel.getByTestId("distribution-counts")).toContainText(/Ready to distribute\s*2/);
    await panel.getByRole("checkbox", { name: /Coach E2E/ }).check();
    await panel.getByRole("checkbox", { name: new RegExp(coachBName) }).check();
    await expect(panel.getByTestId("even-share")).toHaveText("2 coaches: 1 each");
    await noSeriousA11y(head);
    await panel.getByTestId("distribute").click();
    await expect(head.getByText("2 submission(s) distributed")).toBeVisible();
    await expect(panel.getByTestId("progress-e2e.coach")).toContainText("1");
    await expect(panel.getByTestId(`progress-${coachB}`)).toContainText("1");
    await withDb(async (c) => {
      const rows = (await c.query(
        `SELECT s."publicCode", u.username, u."firstName", a."coachId", s.status FROM "TestMarkerAssignment" a JOIN "TestSubmission" s ON s.id = a."submissionId"
           JOIN "User" u ON u.id = s."studentId" WHERE s."testId" = $1 AND a."endedAt" IS NULL`, [testId])).rows;
      expect(rows.map((r) => r.coachId).sort()).toEqual([coachAId, coachBId].sort());
      expect(rows.every((r) => r.status === "ASSIGNED")).toBe(true);
      const mine = rows.find((r) => r.coachId === coachAId)!;
      [code, markedStudent, markedName] = [mine.publicCode, mine.username, mine.firstName];
      expect((await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'TEST_MARKING_DISTRIBUTED' AND "entityId" = $1`, [testId])).rows[0].n).toBe(1);
    });
  });

  test("coach A: the marking queue and a blind marking page — a code only; draft, then submit for approval", async ({ browser, request }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(page, "coach");
    await navigateViaSidebar(page, "/mentor/marking");
    await expect(page.getByRole("heading", { name: "Marking", level: 1 })).toBeVisible();
    const row = page.getByTestId(`queue-${code}`);
    await expect(row).toContainText("Not started");
    await noSeriousA11y(page);
    await row.getByRole("link", { name: code }).click();
    await page.waitForURL(new RegExp(`/mentor/marking/${code}$`));
    await expect(page.getByRole("heading", { name: `Paper ${code}` })).toBeVisible();
    // Named after the test's title (owner 2026-11-22); an older backend: marking-guide.pdf.
    await expect(page.getByTestId("marking-guide")).toContainText(/(- marking guide|marking-guide)\.pdf/);
    // Blind: nothing on the page names the student, the school or the original file.
    const text = (await page.locator("main").innerText());
    for (const leak of [markedName, markedStudent, "E2E Marking School", "IMG_2001", "Kamali", "xtend"]) expect([leak, text.includes(leak)]).toEqual([leak, false]);
    await page.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill("4");
    await page.getByTestId("mark-q1").getByRole("button", { name: "Add a comment" }).click();
    await page.getByTestId("mark-q1").getByLabel("Comment (optional)").fill("Good working");
    await page.getByTestId("save-draft").click();
    await expect(page.getByText(/^Draft saved/)).toBeVisible();
    // Another tab saves first: this (now stale) page's save is refused with plain words, never overwriting the newer marks.
    const ca = { Authorization: `Bearer ${await apiToken(request, "e2e.coach", PASSWORD)}` };
    const mine = await (await request.get(`/api/v1/marking/submissions/${code}`, { headers: ca })).json();
    const [q1] = mine.test.questions as Array<{ id: string }>;
    expect((await request.put(`/api/v1/marking/submissions/${code}/marking`, {
      headers: ca, data: { scores: [{ questionId: q1.id, marks: 3 }], expectedRevision: mine.myMarking.revision },
    })).status()).toBe(200);
    await page.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill("5");
    await page.getByTestId("save-draft").click();
    await expect(page.getByText(/Your marking was changed somewhere else \(another tab or device\)/)).toBeVisible();
    await withDb(async (c) => {
      const m = (await c.query(
        `SELECT sc.marks FROM "TestMarkingScore" sc JOIN "TestMarking" m ON m.id = sc."markingId" JOIN "TestSubmission" s ON s.id = m."submissionId"
          WHERE s."publicCode" = $1 AND sc."questionId" = $2`, [code, q1.id])).rows;
      expect(m.map((r) => Number(r.marks))).toEqual([3]);   // the other tab's mark stands
    });
    await page.reload();
    await expect(page.getByTestId("mark-q1").getByLabel("Marks (of 5)")).toHaveValue("3");
    await page.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill("4");
    await page.getByTestId("save-draft").click();
    await expect(page.getByText(/^Draft saved/)).toBeVisible();
    await page.getByTestId("submit-marking").click();
    await expect(page.getByText("Give marks for every question before submitting.")).toBeVisible();
    await page.getByTestId("mark-q2").getByLabel("Marks (of 15)").fill("16");
    await page.getByTestId("submit-marking").click();
    await expect(page.getByText("At most 15.")).toBeVisible();
    await page.getByTestId("mark-q2").getByLabel("Marks (of 15)").fill("11");
    await expect(page.getByTestId("running-total")).toHaveText("Total: 15 / 20");
    await noSeriousA11y(page);
    await page.getByTestId("submit-marking").click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submitted for approval.")).toBeVisible();
    await expect(page.getByTestId("save-draft")).toHaveCount(0);
    await withDb(async (c) => {
      const s = (await c.query(`SELECT status FROM "TestSubmission" WHERE "publicCode" = $1`, [code])).rows[0];
      expect(s.status).toBe("MARKED");
    });
    await page.context().close();
  });

  test("Review: the Head Coach requests an independent second marking by coach B", async () => {
    await head.getByTestId("tab-review").click();
    const row = head.getByTestId(`review-${markedStudent}`);
    await expect(row).toContainText("Awaiting review");
    await expect(row).toContainText("15");
    await row.getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await expect(detail.getByTestId("total-FIRST")).toHaveText("15");
    await expect(detail).toContainText(markedName);   // reviewers see who it is
    await detail.getByTestId("action-second").click();
    const dialog = head.getByTestId("coach-dialog");
    await dialog.getByTestId("coach-select").selectOption({ label: `${coachBName} E2E (1 assigned)` });
    await dialog.getByTestId("coach-confirm").click();
    await expect(head.getByText("A second coach marks it independently")).toBeVisible();
    await expect(detail.getByTestId("submission-status")).toHaveText("Second marking");
    await noSeriousA11y(head);
    await head.getByRole("button", { name: "Close" }).click();
  });

  test("coach B marks independently: the first marks and comments are nowhere on the page", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signInWith(page, coachB, PASSWORD);
    await navigateViaSidebar(page, "/mentor/marking");
    await page.getByTestId(`queue-${code}`).getByRole("link", { name: code }).click();
    await expect(page.getByRole("heading", { name: `Paper ${code}` })).toBeVisible();
    const text = await page.locator("main").innerText();
    for (const leak of ["Good working", "15 / 20", "Coach E2E", markedName]) expect([leak, text.includes(leak)]).toEqual([leak, false]);
    await expect(page.getByTestId("running-total")).toHaveText("Total: —");
    await page.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill("5");
    await page.getByTestId("mark-q2").getByLabel("Marks (of 15)").fill("9");
    await page.getByTestId("submit-marking").click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submitted for approval.")).toBeVisible();
    await page.context().close();
  });

  test("side by side; the Head Coach adjusts the mark (reason), approves (locked), unlocks (reason); History shows the change", async () => {
    test.setTimeout(120_000);
    await head.reload();
    await head.getByTestId("tab-review").click();
    await head.getByTestId(`review-${markedStudent}`).getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await expect(detail.getByTestId("total-FIRST")).toHaveText("15");
    await expect(detail.getByTestId("total-SECOND")).toHaveText("14");
    // Approving needs a choice first (two markings).
    await detail.getByTestId("action-approve").click();
    await expect(head.getByTestId("decision-approve")).toContainText("chooses the mark first");
    await head.getByTestId("decision-approve").getByRole("button", { name: "Cancel" }).click();
    await detail.getByTestId("action-choose").click();
    const choose = head.getByTestId("decision-choose");
    await choose.getByTestId("choose-ADJUSTMENT").check();
    await choose.getByTestId("adjust-q1").fill("5");
    await choose.getByTestId("adjust-q2").fill("10");
    await choose.getByTestId("decision-confirm").click();
    await expect(choose.getByText("At least 3 characters.")).toBeVisible();   // the reason is mandatory
    await choose.getByTestId("decision-text").fill("Between the two markings");
    await choose.getByTestId("decision-confirm").click();
    await expect(head.getByText("Adjusted marks recorded as the final mark.")).toBeVisible();
    await expect(detail.getByTestId("total-ADJUSTMENT")).toHaveText("15");
    await detail.getByTestId("action-approve").click();
    await head.getByTestId("decision-approve").getByTestId("decision-confirm").click();
    await expect(head.getByText("Approved: the result is locked.")).toBeVisible();
    await expect(detail.getByTestId("submission-status")).toHaveText("Approved");
    await expect(detail.getByTestId("action-choose")).toHaveCount(0);
    await detail.getByTestId("action-unlock").click();
    const unlock = head.getByTestId("decision-unlock");
    await unlock.getByTestId("decision-text").fill("Recount question 2");
    await unlock.getByTestId("decision-confirm").click();
    await expect(head.getByText("Unlocked: it can be reviewed again.")).toBeVisible();
    await expect(detail.getByTestId("submission-status")).toHaveText("Awaiting review");
    await head.getByRole("button", { name: "Close" }).click();
    await head.getByTestId("tab-history").click();
    await head.getByTestId("history-panel").getByRole("button", { name: "Mark changes" }).click();
    await expect(head.getByTestId("history-rows")).toContainText("9 → 10");
    await expect(head.getByTestId("history-rows")).toContainText("Between the two markings");
    await noSeriousA11y(head);
    await withDb(async (c) => {
      const sub = (await c.query(`SELECT id, status FROM "TestSubmission" WHERE "publicCode" = $1`, [code])).rows[0];
      expect(sub.status).toBe("MARKED");
      const reviews = (await c.query(`SELECT action, "chosenKind", comment FROM "TestReview" WHERE "submissionId" = $1 ORDER BY "createdAt"`, [sub.id])).rows;
      expect(reviews.map((r) => r.action)).toEqual(["SECOND_MARKING_REQUESTED", "MARK_CHOSEN", "APPROVED", "UNLOCKED"]);
      expect(reviews[1]).toMatchObject({ chosenKind: "ADJUSTMENT", comment: "Between the two markings" });
      const audit = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 AND action LIKE 'TEST_%' AND action <> 'TEST_SUBMITTED' ORDER BY "createdAt"`, [sub.id])).rows.map((r) => r.action);
      expect(audit).toEqual(["TEST_SECOND_MARKING_REQUESTED", "TEST_MARK_CHOSEN", "TEST_MARKING_APPROVED", "TEST_MARKING_UNLOCKED"]);
    });
  });
});
