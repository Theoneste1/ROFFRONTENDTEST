/**
 * Test Management, Phase 1 (owner-approved plan 2026-11-19), in a real browser against the real backend and PostgreSQL.
 *  1. An Administrator creates a test with the wizard (details → two questions → paper and marking guide), sees the sum
 *     against the maximum, reorders the questions, opens the files (neutral names) and authorises a coach as a marker
 *     of the subject; every result is checked in the database (rows and TESTS audit entries).
 *  2. A Head Coach who heads Physics: the coach portal's Tests list shows only Physics tests, the New test form offers
 *     only Physics, and the Administrator's Mathematics test is refused (another subject).
 * Fixtures (synthetic, unique per run): the e2e Head Coach heads Physics (an active membership, what an Administrator's
 * "heads" choice produces); a Physics test inserted for this run.
 */
import { expect, test, type Page } from "@playwright/test";
import { idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

/** The portal's menu offers the page (directly or under "More"); then open it. */
async function openFromMenu(page: Page, href: string) {
  await expect(page.getByTestId("sidebar-nav").first().locator(`a[href="${href}"]`)).toHaveCount(1);
  await page.goto(href);
}

const run = Date.now().toString(36);
const mathsTitle = `E2E Algebra test ${run}`;
const physicsTitle = `E2E Physics test ${run}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

/** `datetime-local` value `days` from now at hh:00 (browser local time). */
function local(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`;
}

let mathsTestId: string;
let physicsTestId: string;

test.beforeAll(async () => {
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
    physicsTestId = (await c.query<{ id: string }>(
      `INSERT INTO "Test" (id, title, "disciplineId", division, "answerFormat", "opensAt", "closesAt", "originalClosesAt", "maxMarks", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'SENIOR', 'UPLOAD_ONLY', now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', 30, now())
       RETURNING id`, [physicsTitle, physics],
    )).rows[0].id;
  });
});

test.describe.serial("Administrator: a test from the wizard to its marker", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  test("creates a test with questions, a paper and a marking guide", async () => {
    test.setTimeout(120_000);
    await openFromMenu(page, "/admin/tests");
    await expect(page.getByRole("heading", { name: "Tests", level: 1 })).toBeVisible();
    await page.getByTestId("new-test").click();
    await page.waitForURL(/\/admin\/tests\/new$/);

    // Step 1: details (division mandatory: All by default; Junior chosen).
    await page.getByLabel("Title").fill(mathsTitle);
    const subject = page.getByLabel("Subject");
    await expect(subject.locator("option", { hasText: "Mathematics" })).toBeAttached();
    await subject.selectOption({ label: "Mathematics" });
    await page.getByLabel("Division").selectOption("JUNIOR");
    await page.getByLabel("How students answer").selectOption("BOTH");
    await page.getByLabel("Maximum marks").fill("20");
    await page.getByLabel("Opens").fill(local(1, 9));
    await page.getByLabel("Closes").fill(local(1, 8));   // before it opens: refused on the step
    await page.getByTestId("wizard-next").click();
    await expect(page.getByText("The test must close after it opens.")).toBeVisible();
    await page.getByLabel("Closes").fill(local(1, 11));
    await page.getByTestId("wizard-next").click();

    // Step 2: two questions; the sum is shown against the maximum and may not exceed it.
    await expect(page.getByTestId("wizard-step-questions")).toBeVisible();
    await page.getByTestId("wizard-add-question").click();
    await page.getByLabel("Question 1", { exact: true }).fill("Solve x^2 - 5x + 6 = 0.");
    await page.getByLabel("Marks", { exact: true }).first().fill("15");
    await page.getByTestId("wizard-add-question").click();
    await page.getByLabel("Question 2", { exact: true }).fill("Prove that the square root of 2 is irrational.");
    await page.getByLabel("Marks", { exact: true }).nth(1).fill("8");
    await expect(page.getByTestId("question-sum")).toContainText("3 too many");
    await page.getByTestId("wizard-next").click();
    await expect(page.getByText("The questions total more than the test's 20 marks.")).toBeVisible();
    await page.getByLabel("Marks", { exact: true }).first().fill("12");
    await expect(page.getByTestId("question-sum")).toContainText("Questions total 20 of 20 marks.");
    await page.getByTestId("wizard-next").click();

    // Step 3: the paper and the marking guide.
    await page.getByTestId("wizard-file-paper").setInputFiles({ name: "my-secret-name.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByTestId("wizard-file-guide").setInputFiles({ name: "answers.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByTestId("wizard-submit").click();
    await page.waitForURL(/\/admin\/tests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    mathsTestId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { name: mathsTitle })).toBeVisible();
    await expect(page.getByTestId("test-status")).toHaveText("Draft");

    await withDb(async (c) => {
      const t = (await c.query(`SELECT division, "answerFormat", "maxMarks", status FROM "Test" WHERE id = $1`, [mathsTestId])).rows[0];
      expect(t).toEqual({ division: "JUNIOR", answerFormat: "BOTH", maxMarks: 20, status: "DRAFT" });
      const qs = (await c.query(`SELECT "order", "maxMarks" FROM "TestQuestion" WHERE "testId" = $1 ORDER BY "order"`, [mathsTestId])).rows;
      expect(qs).toEqual([{ order: 1, maxMarks: 12 }, { order: 2, maxMarks: 8 }]);
      const files = (await c.query(`SELECT kind FROM "TestFile" WHERE "testId" = $1`, [mathsTestId])).rows.map((r) => r.kind).sort();
      expect(files).toEqual(["MARKING_GUIDE", "PAPER"]);
    });
  });

  test("questions: the sum against the maximum, reordering; files under neutral names", async () => {
    await page.getByTestId("tab-questions").click();
    await expect(page.getByTestId("question-sum")).toHaveText("Questions total 20 of 20 marks.");
    await page.getByRole("button", { name: "Move question 1 down" }).click();
    await expect(page.getByTestId("question-1")).toContainText("square root of 2");
    await page.getByTestId("tab-files").click();
    await expect(page.getByTestId("file-paper")).toContainText("test-paper.pdf");
    await expect(page.getByTestId("file-marking-guide")).toContainText("marking-guide.pdf");
    await expect(page.getByText("my-secret-name.pdf")).toHaveCount(0);
  });

  test("authorises a coach as a marker of the subject (audited)", async () => {
    await page.getByTestId("tab-markers").click();
    await expect(page.getByRole("heading", { name: "Markers for Mathematics" })).toBeVisible();
    await page.getByLabel("Search coaches").fill("e2e.coach");
    const candidate = page.getByTestId("candidate-e2e.coach");
    await expect(candidate).toBeVisible();
    await candidate.getByRole("button", { name: /Authorise/ }).click();
    await expect(page.getByTestId("marker-e2e.coach")).toContainText("Authorised");
    await withDb(async (c) => {
      const coach = await idOf(c, "e2e.coach");
      const rows = (await c.query(
        `SELECT m.id FROM "MarkerAuthorization" m JOIN "Discipline" d ON d.id = m."disciplineId" WHERE m."coachId" = $1 AND d.code = 'MATHEMATICS' AND m."revokedAt" IS NULL`, [coach],
      )).rows;
      expect(rows).toHaveLength(1);
      const audit = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1`, [rows[0].id])).rows.map((r) => r.action);
      expect(audit).toEqual(["MARKER_AUTHORIZED"]);
      const testAudit = (await c.query(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 OR metadata->>'testId' = $1`, [mathsTestId])).rows.map((r) => r.action).sort();
      expect(testAudit).toEqual(expect.arrayContaining(["TEST_CREATED", "TEST_FILE_UPLOADED", "TEST_QUESTIONS_REORDERED"]));
    });
  });
});

test.describe.serial("Head Coach: only the subjects they head", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "headCoach");
  });
  test.afterAll(async () => page.close());

  test("the coach portal lists Physics tests only, offers only Physics, and refuses the Mathematics test", async () => {
    await openFromMenu(page, "/mentor/tests");
    const list = page.getByTestId("tests-list");
    await expect(list.getByTestId(`test-row-${physicsTestId}`)).toContainText(physicsTitle);
    await expect(list.getByText(mathsTitle)).toHaveCount(0);

    await page.getByTestId("new-test").click();
    await page.waitForURL(/\/mentor\/tests\/new$/);
    const subjects = await page.getByLabel("Subject").locator("option").allTextContents();
    expect(subjects.filter((s) => s !== "Choose a subject" && s !== "Loading…")).toEqual(["Physics"]);

    await page.goto(`/mentor/tests/${mathsTestId}`);
    await expect(page.getByText("This test belongs to a subject you do not head.")).toBeVisible({ timeout: 30_000 });

    await page.goto(`/mentor/tests/${physicsTestId}`);
    await expect(page.getByRole("heading", { name: physicsTitle })).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("tab-markers").click();
    await expect(page.getByRole("heading", { name: "Markers for Physics" })).toBeVisible();
  });
});
