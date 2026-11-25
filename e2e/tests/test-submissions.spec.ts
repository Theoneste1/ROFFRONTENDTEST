/**
 * Test Management, Phase 2 (owner-approved plan 2026-11-19), in a real browser against the real backend and PostgreSQL.
 *  1. A student opens My tests, answers with typed text and two photo pages (one page's upload fails on a weak
 *     connection and is retried on its own), submits — then the answer is locked (owner 2026-11-21): no form, a
 *     "Submitted and locked" notice. An Administrator allows one more submission with a reason (history kept); the
 *     student submits version 2, locked again, and sees both versions.
 *  2. An Administrator gives the student an extension (Extensions tab) and sees the submissions (Submissions tab: state,
 *     versions with the submitter, the "Extended" mark). The student then sees the new deadline — and no "Extended" mark.
 *  3. A teacher (G2) opens Tests, the test's students, and submits for a verified student of their school.
 * Every result is checked in the database. Fixtures (synthetic, unique per run): a school; e2e.student verified there;
 * e2e.teacher assigned to it; a second verified student; a published Mathematics test (Junior, typed or upload), created
 * through the API so its times are the server's.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { assignTeacherSchool, claim, createSchool, createStudent, idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn } from "../support/session";
import { passwordOf } from "../support/accounts";
import { addFilter, changeFilter } from "../support/filters";

const run = Date.now().toString(36);
const title = `E2E Answer round ${run}`;
const classmate = `e2e.ts.${run}`;
const classmateName = `Dina${run}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let testId: string;
let studentId: string;
let classmateId: string;

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

/** `datetime-local` value `days` from now at hh:00 (browser local time). */
function local(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

async function noSeriousA11y(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  await withDb(async (c) => {
    const school = await createSchool(c, `E2E Test School ${run}`);
    studentId = await idOf(c, "e2e.student");
    // e2e.student becomes a verified student of this run's school (an earlier claim is superseded first).
    await c.query(`UPDATE "StudentSchoolAffiliation" SET "supersededAt" = now() WHERE "studentId" = $1 AND "supersededAt" IS NULL`, [studentId]);
    await claim(c, studentId, school, "VERIFIED");
    await assignTeacherSchool(c, await idOf(c, "e2e.teacher"), school);
    classmateId = await createStudent(c, classmate, classmateName, school, "VERIFIED");
  });
  const token = await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!");
  const auth = { Authorization: `Bearer ${token}` };
  const subjects = await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json();
  const maths = subjects.find((s: { code: string }) => s.code === "MATHEMATICS").id;
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: maths, division: "JUNIOR", answerFormat: "BOTH", maxMarks: 20,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      questions: [{ prompt: "Show that 1 + 2 + … + n = n(n + 1)/2.", maxMarks: 20 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
});

let deadlineBefore = "";

test.describe.serial("Student: answer page by page, replace, see every version", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();   // a context of its own (axe needs one)
    await signIn(page, "student");
  });
  test.afterAll(async () => page.context().close());

  test("My tests lists the test with my deadline; the test page shows its question", async () => {
    await navigateViaSidebar(page, "/student/tests");
    await expect(page.getByRole("heading", { name: "My tests", level: 1 })).toBeVisible();
    const card = page.getByTestId(`my-test-${testId}`);
    await expect(card).toContainText(title);
    await expect(card).toContainText("Open");
    await card.click();
    await page.waitForURL(new RegExp(`/student/tests/${testId}$`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByTestId("answer-questions")).toContainText("n(n + 1)/2");
    deadlineBefore = (await page.getByTestId("deadline").textContent()) ?? "";
    expect(deadlineBefore).not.toBe("");
    await noSeriousA11y(page);
  });

  test("typed answer + two photo pages; page 2 fails on a weak connection and is retried alone; submit → version 1", async () => {
    test.setTimeout(120_000);
    let page2Calls = 0;
    // The first three sends of page 2 are cut off (a weak connection: the app retries twice by itself, then offers Retry).
    await page.route(/\/uploads\/[0-9a-f-]+\/pages\/2$/, async (route) => {
      if (route.request().method() === "POST" && ++page2Calls <= 3) return route.abort("internetdisconnected");
      return route.continue();
    });
    await page.getByTestId("typed-answer").fill("By induction on n.");
    await page.getByTestId("add-pages").setInputFiles([
      { name: "IMG_1001 Aline.png", mimeType: "image/png", buffer: PNG },
      { name: "IMG_1002 Aline.png", mimeType: "image/png", buffer: PNG },
    ]);
    await expect(page.getByTestId("page-1")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    await expect(page.getByTestId("page-2")).toHaveAttribute("data-status", "failed", { timeout: 30_000 });
    await expect(page.getByTestId("upload-summary")).toContainText("1 of 2 pages uploaded — 1 failed");
    await page.getByTestId("retry-page-2").click();
    await expect(page.getByTestId("page-2")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
    expect(page2Calls).toBe(4);
    await page.getByTestId("submit-answer").click();
    await expect(page.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
    const v1 = page.getByTestId("version-1");
    await expect(v1).toContainText("Current");
    // The sheet is named after the student and the test (owner 2026-11-23): "<full name> - <test title> - page N.png";
    // an older backend: page-N.png. The title has letters, digits and spaces only: safe in the pattern as it is.
    await expect(v1.getByText(new RegExp(`^(.+ - ${title} - page 1|page-1)\\.png$`))).toBeVisible();
    await expect(v1.getByText(new RegExp(`^(.+ - ${title} - page 2|page-2)\\.png$`))).toBeVisible();
    await expect(page.getByText("IMG_1001 Aline.png")).toHaveCount(0);
    await page.unroute(/\/uploads\/[0-9a-f-]+\/pages\/2$/);
  });

  test("submitted → locked: no answer form, the locked notice; My tests marks it Locked", async () => {
    await expect(page.getByTestId("answer-locked")).toContainText("Submitted and locked");
    await expect(page.getByTestId("answer-form")).toHaveCount(0);
    await navigateViaSidebar(page, "/student/tests");
    await expect(page.getByTestId(`my-test-${testId}`).getByTestId("locked-badge")).toBeVisible();
  });

  test("an Administrator allows one more submission (reason, history); the student submits version 2, locked again; version 1 is kept", async ({ browser }) => {
    test.setTimeout(120_000);
    const adminPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(adminPage, "admin");
    await adminPage.goto(`/admin/tests/${testId}`);
    await adminPage.getByTestId("tab-submissions").click();
    await adminPage.getByLabel("Search students").fill("e2e.student");
    const row = adminPage.getByTestId("tracking-e2e.student");
    await expect(row.getByTestId("locked-badge")).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: /Versions of/ }).click();
    const panel = adminPage.getByTestId("resubmission-panel");
    await expect(panel).toContainText("Submitted and locked");
    await panel.getByTestId("resubmission-allow").click();
    await panel.getByTestId("resubmission-confirm").click();
    await expect(panel.getByText("Give a reason of 3–500 characters.")).toBeVisible();   // checked before sending
    await panel.getByTestId("resubmission-reason").fill("Wrong base case photographed");
    await panel.getByTestId("resubmission-confirm").click();
    await expect(panel).toContainText("Resubmission allowed");
    await expect(panel.getByTestId("resubmission-history")).toContainText("Wrong base case photographed");
    await adminPage.context().close();

    await page.goto(`/student/tests/${testId}`);
    await expect(page.getByTestId("answer-resubmission")).toContainText("Wrong base case photographed");
    await page.getByTestId("typed-answer").fill("By induction on n (corrected base case).");
    await page.getByTestId("submit-answer").click();
    await expect(page.getByText("Your answer was submitted: version 2.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("version-2")).toContainText("Current");
    await expect(page.getByTestId("version-1")).toBeVisible();
    await expect(page.getByTestId("answer-locked")).toBeVisible();
    await expect(page.getByTestId("answer-form")).toHaveCount(0);
    await withDb(async (c) => {
      const rows = (await c.query(
        `SELECT v.number, v."submitterRole", v."pageCount", v."typedAnswer" IS NOT NULL AS typed
           FROM "TestSubmissionVersion" v JOIN "TestSubmission" s ON s.id = v."submissionId"
          WHERE s."testId" = $1 AND s."studentId" = $2 ORDER BY v.number`, [testId, studentId])).rows;
      expect(rows).toEqual([
        { number: 1, submitterRole: "STUDENT", pageCount: 2, typed: true },
        { number: 2, submitterRole: "STUDENT", pageCount: 0, typed: true },
      ]);
      const pages = (await c.query(`SELECT count(*)::int AS n FROM "TestAnswerPage" WHERE "testId" = $1 AND "studentId" = $2 AND "versionId" IS NULL`, [testId, studentId])).rows[0].n;
      expect(pages).toBe(0);   // nothing left pending
      const auth = (await c.query(
        `SELECT r.reason, r."usedAt" IS NOT NULL AS used, v.number AS version FROM "TestResubmissionAuthorization" r
           JOIN "TestSubmission" s ON s.id = r."submissionId" LEFT JOIN "TestSubmissionVersion" v ON v.id = r."usedVersionId"
          WHERE s."testId" = $1 AND s."studentId" = $2`, [testId, studentId])).rows;
      expect(auth).toEqual([{ reason: "Wrong base case photographed", used: true, version: 2 }]);
      const audit = (await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'TEST_RESUBMISSION_AUTHORIZED' AND metadata->>'testId' = $1`, [testId])).rows[0].n;
      expect(audit).toBe(1);
    });
  });
});

test.describe.serial("Administrator: an extension for the student; the Submissions tab", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();   // a context of its own (axe needs one)
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.context().close());

  test("gives the student an extension with a reason (audited)", async () => {
    await page.goto(`/admin/tests/${testId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("tab-extensions").click();
    await page.getByTestId("new-extension").click();
    const form = page.getByTestId("extension-form");
    await form.getByLabel("Search students").fill("e2e.student");
    // The list follows the search (debounced): choose the student once it is the one listed.
    await expect(form.getByTestId("extension-targets").getByRole("button", { name: /^Choose / })).toHaveCount(1);
    await form.getByRole("button", { name: "Choose Student E2E" }).click();
    await expect(form.getByTestId("extension-target")).toContainText("@e2e.student");
    await form.getByLabel("New deadline").fill(local(1, 18));
    await form.getByLabel("Reason").fill("Power cut at home during the test");
    await form.getByTestId("save-extension").click();
    await expect(page.getByText("The extension was given.")).toBeVisible();
    await expect(page.getByTestId("extension-rows")).toContainText("Power cut at home");
    await withDb(async (c) => {
      const ext = (await c.query(`SELECT id, kind, "studentId" FROM "TestExtension" WHERE "testId" = $1 AND "cancelledAt" IS NULL`, [testId])).rows;
      expect(ext.map((e) => [e.kind, e.studentId])).toEqual([["STUDENT", studentId]]);
      const audit = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1`, [ext[0].id])).rows.map((r) => r.action);
      expect(audit).toEqual(["TEST_EXTENSION_GRANTED"]);
    });
  });

  test("Submissions: the student submitted (2 versions), marked Extended; the versions show the submitter", async () => {
    await page.getByTestId("tab-submissions").click();
    // Every Junior student is listed: search for the two of this run.
    await page.getByLabel("Search students").fill("e2e.student");
    const row = page.getByTestId("tracking-e2e.student");
    await expect(row).toContainText("Submitted");
    await expect(row.getByTestId("extended-badge")).toBeVisible();
    await row.getByRole("button", { name: /Versions of/ }).click();
    const detail = page.getByTestId("submission-detail");
    await expect(detail.getByTestId("staff-version-2")).toContainText("@e2e.student (student)");
    // Staff see the sheet under the student's name and the test's title (owner 2026-11-23); an older backend: page-2.png.
    await expect(detail.getByTestId("staff-version-1")).toContainText(new RegExp(`(Student E2E - ${title} - page 2|page-2)\\.png`));
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByLabel("Search students").fill(classmate);
    await expect(page.getByTestId(`tracking-${classmate}`)).toContainText("Not yet");
  });
});

test.describe.serial("Student: the new deadline, without an \"Extended\" mark", () => {
  test("the deadline shown is the extension's; nothing says Extended", async ({ page }) => {
    await signIn(page, "student");
    await page.goto(`/student/tests/${testId}`);
    await expect(page.getByTestId("deadline")).not.toHaveText(deadlineBefore, { timeout: 30_000 });
    await expect(page.locator("main").getByText(/extended/i)).toHaveCount(0);
  });
});

test.describe.serial("Teacher (G2): submits for a verified student of their school", () => {
  test("Tests → the test's students → submit a typed answer for a classmate", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "teacher");
    await navigateViaSidebar(page, "/teacher/tests");
    await expect(page.getByTestId(`teacher-test-${testId}`)).toContainText(title);
    await page.getByTestId(`teacher-test-${testId}`).getByRole("link", { name: /Students for/ }).click();
    await page.waitForURL(new RegExp(`/teacher/tests/${testId}$`));
    const row = page.getByTestId(`student-row-${classmate}`);
    await expect(row).toContainText("Not yet");
    const own = page.getByTestId("student-row-e2e.student");
    await expect(own).toContainText("Submitted");
    // The student's own answer is locked for the teacher too: View, never Replace.
    await expect(own.getByTestId("locked-badge")).toBeVisible();
    await expect(own.getByRole("link", { name: /^View for/ })).toBeVisible();
    // Level and subject: shown per student, and filters.
    await expect(row.getByTestId("student-level-subjects")).toContainText("Junior");
    // The level filter is in the filter bar ("+ Add filter", then the level; the chip changes it).
    const bar = page.getByTestId("teacher-test-filters");
    await addFilter(bar, "level", "Senior (S4–S6)");
    await expect(page.getByTestId(`student-row-${classmate}`)).toHaveCount(0);
    await changeFilter(bar, "level", "Junior (S1–S3)");
    await expect(page.getByTestId(`student-row-${classmate}`)).toBeVisible();
    await row.getByRole("link", { name: /^Submit for/ }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Answer for ${classmateName}`) })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("typed-answer").fill("Written by the student in class; typed by the teacher.");
    await page.getByTestId("submit-answer").click();
    await expect(page.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("version-1")).toContainText("(teacher)");
    await expect(page.getByTestId("answer-locked")).toBeVisible();   // locked at once: neither the student nor a teacher replaces it
    await withDb(async (c) => {
      const teacherId = await idOf(c, "e2e.teacher");
      const v = (await c.query(
        `SELECT v."submitterRole", v."submittedById", v."teacherId" FROM "TestSubmissionVersion" v JOIN "TestSubmission" s ON s.id = v."submissionId"
          WHERE s."testId" = $1 AND s."studentId" = $2`, [testId, classmateId])).rows;
      expect(v).toEqual([{ submitterRole: "TEACHER", submittedById: teacherId, teacherId }]);
    });
  });
});

test.describe.serial("Administrator: a teacher's test submission, off and back on, in one switch (owner 2026-11-21)", () => {
  test("turned off with a reason: the teacher still signs in and sees the Students page, but not the test's students; turned back on", async ({ browser }) => {
    test.setTimeout(120_000);
    const teacherId = await withDb((c) => idOf(c, "e2e.teacher"));
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(admin, "admin");
    await admin.goto(`/admin/users/${teacherId}`);
    const card = admin.getByTestId("teacher-test-submission");
    await expect(card.getByTestId("teacher-test-submission-state")).toContainText("Allowed", { timeout: 30_000 });
    await card.getByTestId("teacher-test-submission-revoke").click();
    await card.getByTestId("teacher-test-submission-reason").fill("Submitted for students of another school");
    await card.getByTestId("teacher-test-submission-confirm").click();
    await expect(card.getByTestId("teacher-test-submission-state")).toContainText("Turned off");
    await expect(card.getByTestId("teacher-test-submission-state")).toContainText("Submitted for students of another school");

    // The account is untouched: the teacher signs in; the test's students are refused (the backend decides).
    const teacher = await (await browser.newContext()).newPage();
    await signIn(teacher, "teacher");
    const refused = await teacher.request.get(`/api/v1/teacher/tests/${testId}/students`, {
      headers: { Authorization: `Bearer ${await apiToken(teacher.request, "e2e.teacher", passwordOf("teacher"))}` },
    });
    expect(refused.status()).toBe(403);

    // The Users list marks the teacher.
    await admin.goto("/admin/users?role=TEACHER&q=e2e.teacher");
    await expect(admin.getByTestId("test-submission-off").first()).toBeVisible({ timeout: 30_000 });

    await admin.goto(`/admin/users/${teacherId}`);
    await card.getByTestId("teacher-test-submission-restore").click();
    await expect(card.getByTestId("teacher-test-submission-state")).toContainText("Allowed");
    await withDb(async (c) => {
      const actions = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 AND action LIKE 'TEACHER_TEST_SUBMISSION_%' ORDER BY "createdAt"`, [teacherId])).rows.map((r) => r.action);
      expect(actions).toEqual(["TEACHER_TEST_SUBMISSION_REVOKED", "TEACHER_TEST_SUBMISSION_RESTORED"]);
      expect((await c.query(`SELECT "accountStatus"::text AS s FROM "User" WHERE id = $1`, [teacherId])).rows[0].s).toBe("ACTIVE");
    });
    await admin.context().close();
    await teacher.context().close();
  });
});
