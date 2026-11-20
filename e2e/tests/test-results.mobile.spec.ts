/**
 * Test Management, Phase 4 on a phone: a student opens My results from the drawer and reads a published result (marks
 * per question, comments, total; no rank); a teacher reads the school's results. No horizontal scrolling; axe.
 * Fixtures (synthetic, unique per run): a school with a student and a teacher; a Mathematics test answered, marked by
 * e2e.coach, approved and published through the API.
 */
import AxeBuilder from "@axe-core/playwright";
import { hashSync } from "bcryptjs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "../support/db";
import { signInWith } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Phone results ${run}`;
const student = `e2e.rm.s.${run}`;
const teacher = `e2e.rm.t.${run}`;
let testId = "";

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

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

async function openFromDrawer(page: Page, href: string) {
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Main menu" });
  await expect(drawer).toBeVisible();
  const link = drawer.locator(`a[href="${href}"]`);
  if (!(await link.isVisible())) await drawer.getByTestId("sidebar-more-toggle").click();
  await link.click();
  await page.waitForURL(new RegExp(`${href}$`));
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  let coachId = "";
  await withDb(async (c) => {
    const sid = await createSchool(c, `E2E Phone School ${run}`);
    await createStudent(c, student, `Phone${run}`, sid, "VERIFIED");
    coachId = await idOf(c, "e2e.coach");
    const tid = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Tom', $2, $3, 'TEACHER', $4, now(), true, now()) RETURNING id`,
      [teacher, `Phone${run}`, `${teacher}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    await assignTeacherSchool(c, tid, sid);
  });
  const admin = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const maths = (await (await request.get("/api/v1/admin/tests/subjects", { headers: admin })).json()).find((s: { code: string }) => s.code === "MATHEMATICS").id;
  expect([201, 409]).toContain((await request.post("/api/v1/admin/test-markers", { headers: admin, data: { coachId, subjectId: maths } })).status());
  const created = await request.post("/api/v1/admin/tests", {
    headers: admin,
    data: {
      title, subjectId: maths, division: "ALL", answerFormat: "TYPED_ONLY", maxMarks: 10,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "What is 2 + 3? Explain why addition of whole numbers is commutative, with an example.", maxMarks: 10 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: admin })).status()).toBe(200);
  const s = { Authorization: `Bearer ${await apiToken(request, student, PASSWORD)}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: s, data: { clientKey: crypto.randomUUID(), typedAnswer: "5, because a + b = b + a" } })).status()).toBe(201);
  await withDb((c) => c.query(
    `UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]));
  expect((await request.post(`/api/v1/admin/tests/${testId}/marking/distribute`, { headers: admin, data: { coachIds: [coachId] } })).status()).toBe(200);
  const [sub, q] = await withDb(async (c) => [
    (await c.query(`SELECT id, "publicCode" FROM "TestSubmission" WHERE "testId" = $1`, [testId])).rows[0],
    (await c.query(`SELECT id FROM "TestQuestion" WHERE "testId" = $1`, [testId])).rows[0].id as string,
  ] as const);
  const coach = { Authorization: `Bearer ${await apiToken(request, "e2e.coach", PASSWORD)}` };
  const body = { scores: [{ questionId: q, marks: 8, comment: "A longer comment from the marker that must wrap on a narrow phone screen without scrolling sideways." }] };
  expect((await request.put(`/api/v1/marking/submissions/${sub.publicCode}/marking`, { headers: coach, data: body })).status()).toBe(200);
  expect((await request.post(`/api/v1/marking/submissions/${sub.publicCode}/marking/submit`, { headers: coach, data: body })).status()).toBe(200);
  expect((await request.post(`/api/v1/admin/tests/${testId}/marking/submissions/${sub.id}/approve`, { headers: admin, data: {} })).status()).toBe(200);
  expect((await request.post(`/api/v1/admin/tests/${testId}/results/publish`, { headers: admin, data: {} })).status()).toBe(200);
});

test("student on a phone: My results from the drawer, the result page; no rank; no horizontal scrolling", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWith(page, student, PASSWORD);
  await openFromDrawer(page, "/student/results");
  await page.getByTestId(`my-result-${testId}`).click();
  await expect(page.getByTestId("result-total")).toHaveText("8 / 10", { timeout: 30_000 });
  await expect(page.getByTestId("result-q1")).toContainText("must wrap");
  expect((await page.locator("main").innerText()).toLowerCase()).not.toContain("rank");
  await noSeriousA11y(page);
  await noHorizontalScroll(page);
});

test("teacher on a phone: Results from the drawer; the school's published results; no horizontal scrolling", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWith(page, teacher, PASSWORD);
  await openFromDrawer(page, "/teacher/results");
  await page.getByTestId(`school-test-${testId}`).click();
  await expect(page.getByTestId("school-results")).toContainText("8 / 10", { timeout: 30_000 });
  await noSeriousA11y(page);
  await noHorizontalScroll(page);
});
