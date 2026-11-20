/**
 * Test Management — the FULL workflow across roles (owner-approved plan 2026-11-19, Phases 1–4), in a real browser
 * against the real backend and PostgreSQL:
 *   Administrator creates a test with questions and files (wizard), publishes it, authorises two coaches as markers →
 *   a student submits; the Administrator gives a classmate an extension; the deadline passes; the teacher submits for
 *   the classmate under the extension → the extension expires (database time) → the Head Coach distributes → the coaches
 *   mark BLIND → a second marking by the other coach → the Head Coach adjusts the mark (reason) and approves; approves the
 *   other → the Head Coach publishes → the student and the teacher see the results, the Administrator and the Head Coach
 *   the rankings → unlocking withdraws the result → re-approved and republished, it is back.
 * Fixtures (synthetic, unique per run): a school with two students and a teacher; two coaches; the e2e Head Coach heads
 * Physics.
 */
import { hashSync } from "bcryptjs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn, signInWith } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Workflow ${run}`;
const school = `E2E Workflow School ${run}`;
const [stA, stB] = [`e2e.wf.a.${run}`, `e2e.wf.b.${run}`];
const [nameA, nameB] = [`Ange${run}`, `Boris${run}`];
const teacher = `e2e.wf.t.${run}`;
const [coach1, coach2] = [`e2e.wf.c1.${run}`, `e2e.wf.c2.${run}`];
const [coach1Name, coach2Name] = [`MarkerOne${run}`, `MarkerTwo${run}`];
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

/** `datetime-local` value `days` from now at hh:00 (browser local time). */
function local(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

let testId = "";
const ids: Record<string, string> = {};
/** Which coach marks which student's submission first (distribution decides). */
let markerOfA = "";
let otherCoach = "";

async function page(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
}

async function codeOf(studentId: string) {
  return withDb(async (c) => (await c.query(`SELECT "publicCode" FROM "TestSubmission" WHERE "testId" = $1 AND "studentId" = $2`, [testId, studentId])).rows[0].publicCode as string);
}

/** A coach marks one submission (blind: by its code) and submits it. */
async function markAs(browser: Browser, username: string, code: string, q1: string, q2: string, mustNotShow: string[]) {
  const p = await page(browser);
  await signInWith(p, username, PASSWORD);
  await navigateViaSidebar(p, "/mentor/marking");
  await p.getByTestId(`queue-${code}`).getByRole("link", { name: code }).click();
  await expect(p.getByRole("heading", { name: `Submission ${code}` })).toBeVisible({ timeout: 30_000 });
  const text = await p.locator("main").innerText();
  for (const leak of mustNotShow) expect([leak, text.includes(leak)]).toEqual([leak, false]);
  await p.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill(q1);
  await p.getByTestId("mark-q2").getByLabel("Marks (of 15)").fill(q2);
  await p.getByTestId("submit-marking").click();
  await p.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await expect(p.getByText("Submitted for approval.")).toBeVisible();
  await p.context().close();
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
    const sid = await createSchool(c, school);
    ids.a = await createStudent(c, stA, nameA, sid, "VERIFIED");
    ids.b = await createStudent(c, stB, nameB, sid, "VERIFIED");
    const mk = async (username: string, first: string, role: "TEACHER" | "MENTOR") => (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'E2E', $3, $4::"Role", $5, now(), true, now()) RETURNING id`,
      [username, first, `${username}@e2e.local`, role, hashSync(PASSWORD, 4)])).rows[0].id;
    ids.teacher = await mk(teacher, `Teach${run}`, "TEACHER");
    ids.c1 = await mk(coach1, coach1Name, "MENTOR");
    ids.c2 = await mk(coach2, coach2Name, "MENTOR");
    await assignTeacherSchool(c, ids.teacher, sid);
  });
});

test.describe.serial("the complete test workflow, from creation to republication", () => {
  let admin: Page;
  let head: Page;
  test.beforeAll(async ({ browser }) => {
    admin = await page(browser);
    await signIn(admin, "admin");
  });
  test.afterAll(async () => { await admin.context().close(); await head?.context().close(); });

  test("1. the Administrator creates the test with the wizard (questions, paper, marking guide), publishes it and authorises two markers", async () => {
    test.setTimeout(180_000);
    await admin.goto("/admin/tests/new");
    await admin.getByLabel("Title").fill(title);
    const subject = admin.getByLabel("Subject");
    await expect(subject.locator("option", { hasText: "Physics" })).toBeAttached();
    await subject.selectOption({ label: "Physics" });
    await admin.getByLabel("Division").selectOption("ALL");
    await admin.getByLabel("How students answer").selectOption("BOTH");
    await admin.getByLabel("Maximum marks").fill("20");
    await admin.getByLabel("Opens").fill(local(1, 9));
    await admin.getByLabel("Closes").fill(local(1, 11));
    await admin.getByTestId("wizard-next").click();
    await admin.getByTestId("wizard-add-question").click();
    await admin.getByLabel("Question 1", { exact: true }).fill("State Newton's first law.");
    await admin.getByLabel("Marks", { exact: true }).first().fill("5");
    await admin.getByTestId("wizard-add-question").click();
    await admin.getByLabel("Question 2", { exact: true }).fill("A 3 kg mass accelerates at 4 m/s². Find the net force.");
    await admin.getByLabel("Marks", { exact: true }).nth(1).fill("15");
    await expect(admin.getByTestId("question-sum")).toContainText("Questions total 20 of 20 marks.");
    await admin.getByTestId("wizard-next").click();
    await admin.getByTestId("wizard-file-paper").setInputFiles({ name: "paper.pdf", mimeType: "application/pdf", buffer: PDF });
    await admin.getByTestId("wizard-file-guide").setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: PDF });
    await admin.getByTestId("wizard-submit").click();
    await admin.waitForURL(/\/admin\/tests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    testId = admin.url().split("/").pop()!;
    // The test opens now (database time) instead of tomorrow, for the run.
    await withDb((c) => c.query(
      `UPDATE "Test" SET "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 hour', "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') + interval '2 hours',
              "originalClosesAt" = (clock_timestamp() AT TIME ZONE 'UTC') + interval '2 hours' WHERE id = $1`, [testId]));
    await admin.reload();
    await admin.getByTestId("publish-test").click();
    await admin.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await expect(admin.getByTestId("test-status")).toHaveText("Published");
    await admin.getByTestId("tab-markers").click();
    for (const [username, name] of [[coach1, coach1Name], [coach2, coach2Name]] as const) {
      await admin.getByLabel("Search coaches").fill(username);
      await admin.getByTestId(`candidate-${username}`).getByRole("button", { name: `Authorise ${name} E2E` }).click();
      await expect(admin.getByTestId(`marker-${username}`)).toContainText("Authorised");
    }
  });

  test("2. the student submits; the Administrator gives the classmate an extension; after the deadline the teacher submits for the classmate under it", async ({ browser }) => {
    test.setTimeout(240_000);
    const s = await page(browser);
    await signInWith(s, stA, PASSWORD);
    await s.goto(`/student/tests/${testId}`);
    await expect(s.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    await s.getByTestId("typed-answer").fill("F = ma; here F = 12 N.");
    await s.getByTestId("submit-answer").click();
    await expect(s.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
    await s.context().close();

    await admin.getByTestId("tab-extensions").click();
    await admin.getByTestId("new-extension").click();
    const form = admin.getByTestId("extension-form");
    await form.getByLabel("Search students").fill(stB);
    await expect(form.getByTestId("extension-targets").getByRole("button", { name: /^Choose / })).toHaveCount(1);
    await form.getByRole("button", { name: `Choose ${nameB} E2E` }).click();
    await form.getByLabel("New deadline").fill(local(1, 18));
    await form.getByLabel("Reason").fill("Away at a regional competition");
    await form.getByTestId("save-extension").click();
    await expect(admin.getByText("The extension was given.")).toBeVisible();

    // The test's own deadline passes (database time); the classmate's extension still runs.
    await withDb((c) => c.query(`UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE id = $1`, [testId]));
    const t = await page(browser);
    await signInWith(t, teacher, PASSWORD);
    await navigateViaSidebar(t, "/teacher/tests");
    await t.getByTestId(`teacher-test-${testId}`).getByRole("link", { name: /Students for/ }).click();
    await t.getByTestId(`student-row-${stB}`).getByRole("link", { name: /^Submit for/ }).click();
    await expect(t.getByRole("heading", { name: new RegExp(`Answer for ${nameB}`) })).toBeVisible({ timeout: 30_000 });
    await t.getByTestId("typed-answer").fill("Net force = 3 x 4 = 12 N (written in class, typed by the teacher).");
    await t.getByTestId("submit-answer").click();
    await expect(t.getByTestId("version-1")).toContainText("(teacher)", { timeout: 30_000 });
    await t.context().close();
    await withDb(async (c) => {
      const v = (await c.query(
        `SELECT v."submitterRole", v."underExtension", v."teacherId" FROM "TestSubmissionVersion" v JOIN "TestSubmission" s ON s.id = v."submissionId"
          WHERE s."testId" = $1 AND s."studentId" = $2`, [testId, ids.b])).rows;
      expect(v).toEqual([{ submitterRole: "TEACHER", underExtension: true, teacherId: ids.teacher }]);
      // The extension expires (database time): marking may begin (G5).
      await c.query(`UPDATE "TestExtension" SET "newDeadline" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "testId" = $1`, [testId]);
    });
  });

  test("3. the Head Coach distributes; the coaches mark blind; a second marking by the other coach", async ({ browser }) => {
    test.setTimeout(300_000);
    head = await page(browser);
    await signIn(head, "headCoach");
    await head.goto(`/mentor/tests/${testId}`);
    await expect(head.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    await head.getByTestId("tab-markers").click();
    const panel = head.getByTestId("distribution-panel");
    await expect(panel.getByTestId("distribution-counts")).toContainText(/Ready to distribute\s*2/);
    await panel.getByRole("checkbox", { name: new RegExp(coach1Name) }).check();
    await panel.getByRole("checkbox", { name: new RegExp(coach2Name) }).check();
    await panel.getByTestId("distribute").click();
    await expect(head.getByText("2 submission(s) distributed")).toBeVisible();
    const assigned = await withDb(async (c) => (await c.query(
      `SELECT s."studentId", a."coachId" FROM "TestMarkerAssignment" a JOIN "TestSubmission" s ON s.id = a."submissionId" WHERE s."testId" = $1 AND a."endedAt" IS NULL`, [testId])).rows);
    const byStudent = Object.fromEntries(assigned.map((r) => [r.studentId, r.coachId]));
    markerOfA = byStudent[ids.a] === ids.c1 ? coach1 : coach2;
    otherCoach = markerOfA === coach1 ? coach2 : coach1;
    const markerOfB = byStudent[ids.b] === ids.c1 ? coach1 : coach2;
    const [codeA, codeB] = [await codeOf(ids.a), await codeOf(ids.b)];
    const identity = [nameA, nameB, stA, stB, school, "xtend", `Teach${run}`];
    await markAs(browser, markerOfA, codeA, "4", "12", identity);
    await markAs(browser, markerOfB, codeB, "5", "10", identity);
    // Second marking of A's answer by the other coach.
    await head.getByTestId("tab-review").click();
    await head.getByTestId(`review-${stA}`).getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await expect(detail.getByTestId("total-FIRST")).toHaveText("16");
    await detail.getByTestId("action-second").click();
    const dialog = head.getByTestId("coach-dialog");
    await dialog.getByTestId("coach-select").selectOption(otherCoach === coach1 ? ids.c1 : ids.c2);
    await dialog.getByTestId("coach-confirm").click();
    await expect(detail.getByTestId("submission-status")).toHaveText("Awaiting second marking");
    await head.getByRole("button", { name: "Close" }).click();
    // The second marker never sees the first marks or comments, nor who the student is.
    await markAs(browser, otherCoach, codeA, "5", "13", [...identity, "16 / 20"]);
  });

  test("4. the Head Coach adjusts the mark (reason), approves both, and publishes", async () => {
    test.setTimeout(180_000);
    await head.reload();
    await head.getByTestId("tab-review").click();
    await head.getByTestId(`review-${stA}`).getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await expect(detail.getByTestId("total-SECOND")).toHaveText("18");
    await detail.getByTestId("action-choose").click();
    const choose = head.getByTestId("decision-choose");
    await choose.getByTestId("choose-ADJUSTMENT").check();
    await choose.getByTestId("adjust-q1").fill("5");
    await choose.getByTestId("adjust-q2").fill("12");
    await choose.getByTestId("decision-text").fill("Between the two independent markings");
    await choose.getByTestId("decision-confirm").click();
    await expect(head.getByText("Adjusted marks recorded as the final mark.")).toBeVisible();
    await detail.getByTestId("action-approve").click();
    await head.getByTestId("decision-approve").getByTestId("decision-confirm").click();
    await expect(head.getByText("Approved: the result is locked.")).toBeVisible();
    await head.getByRole("button", { name: "Close" }).click();
    await head.getByTestId(`review-${stB}`).getByRole("button", { name: /^Review / }).click();
    await head.getByTestId("review-detail").getByTestId("action-approve").click();
    await head.getByTestId("decision-approve").getByTestId("decision-confirm").click();
    await expect(head.getByText("Approved: the result is locked.")).toBeVisible();
    await head.getByRole("button", { name: "Close" }).click();
    await head.getByTestId("tab-publishing").click();
    const panel = head.getByTestId("publishing-panel");
    await expect(panel.getByTestId("count-approved")).toHaveText("2");
    await panel.getByTestId("publish-results").click();
    await expect(head.getByText(/Published 2 results \(publication 1\)/)).toBeVisible();
  });

  test("5. the student and the teacher see the results (no rank); the Administrator and the Head Coach see the rankings", async ({ browser }) => {
    test.setTimeout(180_000);
    const s = await page(browser);
    await signInWith(s, stA, PASSWORD);
    await navigateViaSidebar(s, "/student/results");
    await s.getByTestId(`my-result-${testId}`).click();
    await expect(s.getByTestId("result-total")).toHaveText("17 / 20", { timeout: 30_000 });
    await expect(s.getByTestId("result-q2")).toContainText("12 / 15");
    expect((await s.locator("main").innerText()).toLowerCase()).not.toContain("rank");
    await s.context().close();
    const t = await page(browser);
    await signInWith(t, teacher, PASSWORD);
    await t.goto(`/teacher/results/${testId}`);
    await expect(t.getByTestId(`school-result-${ids.b}`)).toContainText("15 / 20", { timeout: 30_000 });
    await expect(t.getByTestId(`school-result-${ids.a}`)).toContainText("17 / 20");
    await t.context().close();
    await admin.goto(`/admin/tests/${testId}?tab=rankings`);
    await expect(admin.getByTestId(`ranking-${ids.a}`).getByTestId("rank")).toHaveText("1", { timeout: 30_000 });
    await expect(admin.getByTestId(`ranking-${ids.b}`).getByTestId("rank")).toHaveText("2");
    await head.getByTestId("tab-rankings").click();
    await expect(head.getByTestId(`ranking-${ids.a}`)).toContainText("17 / 20");
  });

  test("6. unlocking the published result withdraws it; re-approved and republished, it is back", async ({ browser }) => {
    test.setTimeout(180_000);
    await head.getByTestId("tab-review").click();
    await head.getByTestId("review-panel").getByRole("button", { name: "Published" }).click();
    await head.getByTestId(`review-${stA}`).getByRole("button", { name: /^Review / }).click();
    const detail = head.getByTestId("review-detail");
    await detail.getByTestId("action-unlock").click();
    await head.getByTestId("decision-unlock").getByTestId("decision-text").fill("Parent asked for a re-check");
    await head.getByTestId("decision-unlock").getByTestId("decision-confirm").click();
    await expect(head.getByText(/Unlocked and withdrawn/)).toBeVisible();
    const s = await page(browser);
    await signInWith(s, stA, PASSWORD);
    await s.goto(`/student/results/${testId}`);
    await expect(s.getByTestId("result-not-published")).toBeVisible({ timeout: 30_000 });
    await detail.getByTestId("action-approve").click();
    await head.getByTestId("decision-approve").getByTestId("decision-confirm").click();
    await expect(head.getByText("Approved: the result is locked.")).toBeVisible();
    await head.getByRole("button", { name: "Close" }).click();
    await head.getByTestId("tab-publishing").click();
    await head.getByTestId("publishing-panel").getByTestId("publish-results").click();
    await expect(head.getByText(/Published 1 result \(publication 2\)/)).toBeVisible();
    await s.reload();
    await expect(s.getByTestId("result-total")).toHaveText("17 / 20", { timeout: 30_000 });
    await s.context().close();
    await withDb(async (c) => {
      const statuses = (await c.query(`SELECT "toStatus" FROM "TestSubmissionStatusChange" sc JOIN "TestSubmission" s ON s.id = sc."submissionId"
        WHERE s."testId" = $1 AND s."studentId" = $2 ORDER BY sc."createdAt"`, [testId, ids.a])).rows.map((r) => r.toStatus);
      expect(statuses).toEqual(["SUBMITTED", "ASSIGNED", "MARKING_IN_PROGRESS", "MARKED", "AWAITING_SECOND_MARKING", "MARKED", "MARKED", "APPROVED",
        "PUBLISHED", "MARKED", "APPROVED", "PUBLISHED"]);
      const notices = (await c.query(`SELECT type FROM "NotificationOutbox" WHERE "recipientUserId" = $1 AND type LIKE 'test.result%' ORDER BY "createdAt"`, [ids.a])).rows.map((r) => r.type);
      expect(notices).toEqual(["test.results.published", "test.result.withdrawn", "test.results.published"]);
    });
  });
});
