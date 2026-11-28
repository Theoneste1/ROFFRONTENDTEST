/**
 * Reassign a submission on a phone (390 px wide; owner 2026-11-28): "Find a submission" as a stacked list, the two-step
 * dialog in one column with full-width buttons, and no sideways scrolling anywhere. Fixtures synthetic, unique per run.
 * Screenshots for the owner when REASSIGN_SHOTS_DIR is set.
 */
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { createSchool, createStudent, withDb } from "../support/db";
import { signIn } from "../support/session";
import { apiToken, ensureSubjects, publishedTest, submitTyped } from "../support/reassignment";

test.use({ viewport: { width: 390, height: 844 } });

const run = Date.now().toString(36);
const student = `e2e.ram.${run}`;
const first = `Phone${run}`;
const junior = `E2E RA phone Junior ${run}`;
const senior = `E2E RA phone Senior ${run}`;
let seniorId = "";
let submissionId = "";
const SHOTS = process.env.REASSIGN_SHOTS_DIR;

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  await withDb(async (c) => createStudent(c, student, first, await createSchool(c, `E2E RA Phone School ${run}`), "VERIFIED"));
  const auth = await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!");
  const s = await ensureSubjects(request, auth);
  const juniorId = await publishedTest(request, auth, junior, s.MATHEMATICS, "JUNIOR");
  seniorId = await publishedTest(request, auth, senior, s.MATHEMATICS, "SENIOR");
  submissionId = await submitTyped(request, await apiToken(request, student, PASSWORD), juniorId, "The sum is 55.");
});

test("an Administrator on a phone finds the answer in a stacked list and reassigns it in one column", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "admin");
  await page.goto("/admin/tests/submissions");
  await page.getByTestId("find-submission-search").fill(first);
  const item = page.getByTestId(`find-item-${submissionId}`);
  await expect(item).toBeVisible();
  await expect(item).toContainText(junior);
  await expect(page.getByTestId(`find-row-${submissionId}`)).toBeHidden();   // the table is for wide screens
  await noHorizontalScroll(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-0-find.png` });

  await item.getByTestId("reassign-open").click();
  const d = page.getByTestId("reassign-dialog");
  await d.getByTestId("reassign-level").selectOption("SENIOR");
  // Earlier runs leave other Senior Mathematics tests in the database: choose this run's.
  await d.getByTestId("reassign-test").selectOption(seniorId);
  await d.getByTestId("reassign-reason").fill("Should be Senior Mathematics.");
  await noHorizontalScroll(page);
  // One column: the level sits under the programme; the main button is as wide as the form.
  const subjectBox = (await d.getByTestId("reassign-subject").boundingBox())!;
  const levelBox = (await d.getByTestId("reassign-level").boundingBox())!;
  expect(levelBox.y).toBeGreaterThan(subjectBox.y + subjectBox.height - 1);
  const reviewBox = (await d.getByTestId("reassign-review").boundingBox())!;
  expect(Math.abs(reviewBox.width - subjectBox.width)).toBeLessThan(2);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-1-choose.png` });

  await d.getByTestId("reassign-review").click();
  await expect(d.getByTestId("reassign-new")).toContainText(senior);
  await noHorizontalScroll(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-2-review.png` });
  await d.getByTestId("reassign-confirm").click();
  await expect(page.getByTestId("reassign-success")).toContainText(`now belongs to ${senior}`);
  await expect(page.getByTestId(`find-item-${submissionId}`)).toContainText(senior);
  await noHorizontalScroll(page);
  await withDb(async (c) => {
    const s = (await c.query(`SELECT "testId", level FROM "TestSubmission" WHERE id = $1`, [submissionId])).rows[0];
    expect([s.testId, s.level]).toEqual([seniorId, "SENIOR"]);
  });
});
