/**
 * Test Management, Phase 2 (owner-approved plan 2026-11-19), in a real browser against the real backend and PostgreSQL.
 *  1. A student opens My tests, answers with typed text and two photo pages (one page's upload fails on a weak
 *     connection and is retried on its own), submits, replaces (a new version), and sees both versions.
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
    await expect(v1.getByText("page-1.png")).toBeVisible();
    await expect(v1.getByText("page-2.png")).toBeVisible();
    await expect(page.getByText("IMG_1001 Aline.png")).toHaveCount(0);
    await page.unroute(/\/uploads\/[0-9a-f-]+\/pages\/2$/);
  });

  test("replace before the deadline → version 2; version 1 is kept", async () => {
    await expect(page.getByRole("heading", { name: "Replace the answer" })).toBeVisible();
    await page.getByTestId("typed-answer").fill("By induction on n (corrected base case).");
    await page.getByTestId("submit-answer").click();
    await expect(page.getByText("Your answer was submitted: version 2.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("version-2")).toContainText("Current");
    await expect(page.getByTestId("version-1")).toBeVisible();
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
    await expect(detail.getByTestId("staff-version-1")).toContainText("page-2.png");
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
    await expect(page.getByTestId("student-row-e2e.student")).toContainText("Submitted");
    await row.getByRole("link", { name: /^Submit for/ }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Answer for ${classmateName}`) })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("typed-answer").fill("Written by the student in class; typed by the teacher.");
    await page.getByTestId("submit-answer").click();
    await expect(page.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("version-1")).toContainText("(teacher)");
    await withDb(async (c) => {
      const teacherId = await idOf(c, "e2e.teacher");
      const v = (await c.query(
        `SELECT v."submitterRole", v."submittedById", v."teacherId" FROM "TestSubmissionVersion" v JOIN "TestSubmission" s ON s.id = v."submissionId"
          WHERE s."testId" = $1 AND s."studentId" = $2`, [testId, classmateId])).rows;
      expect(v).toEqual([{ submitterRole: "TEACHER", submittedById: teacherId, teacherId }]);
    });
  });
});
