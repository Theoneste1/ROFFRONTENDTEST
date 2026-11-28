/**
 * Reassign a submission (owner 2026-11-28; tests.reassignSubmission: Administrators and Super Administrators), in a real
 * browser against the real backend and PostgreSQL:
 *  1. An Administrator opens Tests → "Find a submission", finds a student's answer by name and moves it from the Junior
 *     Mathematics test to the Senior Mathematics test (Choose → Review → Confirm); the list then shows the new test and
 *     level, the SAME submission row moved (database), and the test's submission shows the correction in "Corrections".
 *  2. A Super Administrator, inside the Physics test's Submissions tab, moves an answer from Physics to Computing; the
 *     submission dialog closes and the answer leaves this test.
 *  3. Marking started (the submission is ASSIGNED): the amber note, programme and test locked; the level can still change.
 *  4. A Head Coach, a Coach, a Teacher and a Student see no "Find a submission" and cannot open the page.
 * Fixtures (synthetic, unique per run): a school, a verified student, five published tests (Mathematics Junior, Senior
 * and every level; Physics and Computing for every level), the student's typed answers submitted through the API.
 * Screenshots for the owner when REASSIGN_SHOTS_DIR is set.
 */
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, withDb } from "../support/db";
import { signIn } from "../support/session";
import { apiToken, ensureSubjects, publishedTest, submitTyped } from "../support/reassignment";

const run = Date.now().toString(36);
const student = `e2e.ra.${run}`;
const first = `Reas${run}`;
const T = {
  mj: `E2E RA Mathematics Junior ${run}`,
  ms: `E2E RA Mathematics Senior ${run}`,
  mall: `E2E RA Mathematics every level ${run}`,
  pall: `E2E RA Physics ${run}`,
  call: `E2E RA Computing ${run}`,
};
const id: Record<keyof typeof T, string> = { mj: "", ms: "", mall: "", pall: "", call: "" };
const sub = { maths: "", physics: "", marking: "" };
const SHOTS = process.env.REASSIGN_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  await withDb(async (c) => {
    const school = await createSchool(c, `E2E RA School ${run}`);
    await createStudent(c, student, first, school, "VERIFIED");
  });
  const auth = await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!");
  const s = await ensureSubjects(request, auth);
  id.mj = await publishedTest(request, auth, T.mj, s.MATHEMATICS, "JUNIOR");
  id.ms = await publishedTest(request, auth, T.ms, s.MATHEMATICS, "SENIOR");
  id.mall = await publishedTest(request, auth, T.mall, s.MATHEMATICS, "ALL");
  id.pall = await publishedTest(request, auth, T.pall, s.PHYSICS, "ALL");
  id.call = await publishedTest(request, auth, T.call, s.COMPUTING, "ALL");
  const me = await apiToken(request, student, PASSWORD);
  sub.maths = await submitTyped(request, me, id.mj, "The sum is 55.");
  sub.physics = await submitTyped(request, me, id.pall, "Velocity is speed with direction.");
  sub.marking = await submitTyped(request, me, id.mall, "By induction.");
  // Marking has started on the third answer: it is assigned to a marker (status only; nothing else is needed for the rule).
  await withDb((c) => c.query(`UPDATE "TestSubmission" SET status = 'ASSIGNED' WHERE id = $1`, [sub.marking]));
});

const row = (page: Page, submissionId: string) => page.getByTestId(`find-row-${submissionId}`);

test.describe.serial("Administrator: Find a submission → reassign Junior Mathematics to Senior Mathematics", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.context().close());

  test("Tests has \"Find a submission\"; the page finds the answer by the student's name", async () => {
    await page.goto("/admin/tests");
    await page.getByTestId("find-submission-link").click();
    await page.waitForURL(/\/admin\/tests\/submissions$/);
    await expect(page.getByRole("heading", { name: "Find a submission", level: 1 })).toBeVisible();
    await page.getByTestId("find-submission-search").fill(first);
    const r = row(page, sub.maths);
    await expect(r).toBeVisible();
    await expect(r.getByTestId("find-row-test")).toHaveText(T.mj);
    await expect(r.getByTestId("find-row-subject")).toHaveText("Mathematics");
    await expect(r.getByTestId("find-row-level")).toHaveText("Junior");
    await expect(page.getByTestId("find-submission-rows").locator("tr")).toHaveCount(3);
    await shot(page, "desktop-1-find");
  });

  test("Choose: facts, tests filtered to the programme and level (unavailable ones disabled with why), the reason is required", async () => {
    await row(page, sub.maths).getByTestId("reassign-open").click();
    const d = page.getByTestId("reassign-dialog");
    await expect(d.getByTestId("reassign-facts")).toContainText(`${first} E2E`);
    await expect(d.getByTestId("reassign-facts")).toContainText(T.mj);
    await expect(d.getByTestId("reassign-facts")).toContainText("typed answer");
    await expect(d.getByTestId("reassign-marking-note")).toHaveCount(0);
    await d.getByTestId("reassign-level").selectOption("SENIOR");
    const testSelect = d.getByTestId("reassign-test");
    // Mathematics, for every level or Senior: the Senior test; the every-level one already has this student's answer.
    await expect(testSelect.locator(`option[value="${id.ms}"]`)).toBeEnabled();
    const dup = testSelect.locator(`option[value="${id.mall}"]`);
    await expect(dup).toBeDisabled();
    await expect(dup).toContainText("already has an answer from this student");
    await expect(testSelect.locator(`option[value="${id.mj}"]`)).toHaveCount(0);   // a Junior test: not for Senior
    await expect(testSelect.locator(`option[value="${id.pall}"]`)).toHaveCount(0);  // another programme
    await testSelect.selectOption(id.ms);
    await d.getByTestId("reassign-review").click();
    await expect(d.getByTestId("reassign-reason-error")).toContainText("Write why");
    await d.getByTestId("reassign-reason").fill("abc");
    await d.getByTestId("reassign-review").click();
    await expect(d.getByTestId("reassign-reason-error")).toContainText("at least 5");
    await d.getByTestId("reassign-reason").fill("Student is in S5 and chose the Junior test by mistake.");
    await shot(page, "desktop-2-choose");
    await d.getByTestId("reassign-review").click();
  });

  test("Review: current vs new (changes highlighted); Confirm moves the SAME submission; the list shows the new test and level", async () => {
    const d = page.getByTestId("reassign-dialog");
    await expect(d.getByTestId("reassign-current")).toContainText(T.mj);
    await expect(d.getByTestId("reassign-current")).toContainText("Junior");
    const n = d.getByTestId("reassign-new");
    await expect(n).toContainText(T.ms);
    await expect(n.locator("[data-changed]")).toHaveCount(2);   // test and level; the programme stays Mathematics
    await expect(d.getByTestId("reassign-kept")).toContainText("the typed answer");
    await shot(page, "desktop-3-review");
    await d.getByTestId("reassign-confirm").click();
    await expect(page.getByTestId("reassign-dialog")).toHaveCount(0);
    await expect(page.getByTestId("reassign-success")).toContainText(`now belongs to ${T.ms}`);
    const r = row(page, sub.maths);
    await expect(r.getByTestId("find-row-test")).toHaveText(T.ms);
    await expect(r.getByTestId("find-row-level")).toHaveText("Senior");
    await withDb(async (c) => {
      const s = (await c.query(`SELECT "testId", level, "publicCode" FROM "TestSubmission" WHERE id = $1`, [sub.maths])).rows[0];
      expect([s.testId, s.level]).toEqual([id.ms, "SENIOR"]);
      const audit = (await c.query(`SELECT metadata FROM "AuditLog" WHERE "entityId" = $1 AND action = 'TEST_SUBMISSION_REASSIGNED'`, [sub.maths])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata.reason).toBe("Student is in S5 and chose the Junior test by mistake.");
    });
  });

  test("the Senior test's submission shows the correction under \"Corrections\"", async () => {
    await page.goto(`/admin/tests/${id.ms}`);
    await page.getByTestId("tab-submissions").click();
    await page.getByLabel("Search students").fill(student);
    await page.getByTestId(`tracking-${student}`).getByRole("button", { name: /Versions of/ }).click();
    const detail = page.getByTestId("submission-detail");
    await expect(detail.getByTestId("reassign-open")).toBeVisible();
    const h = detail.getByTestId("reassign-history");
    await expect(h).toContainText(`${T.mj} · Mathematics · Junior → ${T.ms} · Mathematics · Senior`);
    await expect(h).toContainText("chose the Junior test by mistake");
  });

  test("marking started: the amber note; programme and test locked; the level can still change within the same test", async () => {
    await page.goto("/admin/tests/submissions");
    await page.getByTestId("find-submission-search").fill(first);
    const r = row(page, sub.marking);
    await expect(r).toContainText("Assigned");
    await r.getByTestId("reassign-open").click();
    const d = page.getByTestId("reassign-dialog");
    await expect(d.getByTestId("reassign-marking-note")).toContainText("Marking has started");
    await expect(d.getByTestId("reassign-subject")).toBeDisabled();
    await expect(d.getByTestId("reassign-test")).toBeDisabled();
    await expect(d.getByTestId("reassign-level")).toBeEnabled();
    await d.getByTestId("reassign-level").selectOption("SENIOR");
    await expect(d.getByTestId("reassign-test")).toHaveValue(id.mall);
    await d.getByTestId("reassign-reason").fill("The student is in the Senior level.");
    await shot(page, "desktop-4-marking-started");
    await d.getByTestId("reassign-review").click();
    await expect(d.getByTestId("reassign-new").locator("[data-changed]")).toHaveCount(1);
    await d.getByTestId("reassign-confirm").click();
    await expect(page.getByTestId("reassign-success")).toBeVisible();
    await expect(row(page, sub.marking).getByTestId("find-row-level")).toHaveText("Senior");
    await withDb(async (c) => {
      const s = (await c.query(`SELECT "testId", level, status FROM "TestSubmission" WHERE id = $1`, [sub.marking])).rows[0];
      expect([s.testId, s.level, s.status]).toEqual([id.mall, "SENIOR", "ASSIGNED"]);
    });
  });
});

test.describe.serial("Super Administrator: inside the Physics test, reassign Physics → Computing", () => {
  test("the submission's \"Reassign submission\" moves it; the dialog closes and the answer leaves this test", async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, "superAdmin");
    await page.goto(`/admin/tests/${id.pall}`);
    await page.getByTestId("tab-submissions").click();
    await page.getByLabel("Search students").fill(student);
    await page.getByTestId(`tracking-${student}`).getByRole("button", { name: /Versions of/ }).click();
    await page.getByTestId("submission-detail").getByTestId("reassign-open").click();
    const d = page.getByTestId("reassign-dialog");
    await expect(d.getByTestId("reassign-facts")).toContainText(T.pall);
    const computing = await d.getByTestId("reassign-subject").locator("option", { hasText: "Computing" }).getAttribute("value");
    await d.getByTestId("reassign-subject").selectOption(computing!);
    // A test of Computing for every level is picked by itself; earlier runs may have left others: choose this run's.
    await expect(d.getByTestId("reassign-test")).not.toHaveValue("");
    await d.getByTestId("reassign-test").selectOption(id.call);
    await d.getByTestId("reassign-reason").fill("Submitted under Physics by mistake; it is the Computing answer.");
    await d.getByTestId("reassign-review").click();
    const n = d.getByTestId("reassign-new");
    await expect(n).toContainText(T.call);
    await expect(n).toContainText("Computing");
    await expect(n.locator("[data-changed]")).toHaveCount(2);   // test and programme; the level stays
    await d.getByTestId("reassign-confirm").click();
    await expect(page.getByTestId("reassign-dialog")).toHaveCount(0);
    await expect(page.getByTestId("submission-detail")).toHaveCount(0);
    await expect(page.getByTestId("reassign-success")).toContainText(`now belongs to ${T.call} · Computing`);
    await expect(page.getByTestId(`tracking-${student}`)).toContainText("Not yet");
    await withDb(async (c) => {
      const s = (await c.query(`SELECT "testId" FROM "TestSubmission" WHERE id = $1`, [sub.physics])).rows[0];
      expect(s.testId).toBe(id.call);
      const audit = (await c.query(`SELECT "actorRole" FROM "AuditLog" WHERE "entityId" = $1 AND action = 'TEST_SUBMISSION_REASSIGNED'`, [sub.physics])).rows;
      expect(audit.map((a) => a.actorRole)).toEqual(["SUPER_ADMIN"]);
    });
  });
});

test.describe("Other roles: no \"Find a submission\", and the page is not theirs", () => {
  test("Head Coach: Tests has no \"Find a submission\"; the page sends them back to their portal", async ({ page }) => {
    await signIn(page, "headCoach");
    await page.goto("/mentor/tests");
    await expect(page.getByRole("heading", { name: "Tests", level: 1 })).toBeVisible();
    await expect(page.getByTestId("tests-list")).toBeVisible();
    await expect(page.getByTestId("find-submission-link")).toHaveCount(0);
    await page.goto("/admin/tests/submissions");
    await expect(page).not.toHaveURL(/\/admin\//, { timeout: 30_000 });
    await expect(page.getByTestId("find-submission-search")).toHaveCount(0);
  });

  for (const who of ["coach", "teacher", "student"] as const) {
    test(`${who}: /admin/tests/submissions sends them back to their own portal`, async ({ page }) => {
      await signIn(page, who);
      await page.goto("/admin/tests/submissions");
      await expect(page).not.toHaveURL(/\/admin\//, { timeout: 30_000 });
      await expect(page.getByTestId("find-submission-search")).toHaveCount(0);
      await expect(page.getByTestId("find-submission-link")).toHaveCount(0);
    });
  }
});
