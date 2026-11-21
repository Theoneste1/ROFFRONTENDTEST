/**
 * Test Management, Phase 3 on a phone (Pixel 7): a coach reaches Marking from the drawer, opens an assigned submission
 * (a code only), marks it and saves a draft — one column, nothing wider than the screen, no serious accessibility issue.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Phone marking ${run}`;

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

let code = "";

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  const auth = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const maths = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()).find((s: { code: string }) => s.code === "MATHEMATICS").id;
  const coachId = await withDb((c) => idOf(c, "e2e.coach"));
  const granted = await request.post("/api/v1/admin/test-markers", { headers: auth, data: { coachId, subjectId: maths } });
  expect([201, 409]).toContain(granted.status());
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: maths, division: "ALL", answerFormat: "TYPED_ONLY", maxMarks: 5,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "What is 2 + 3?", maxMarks: 5 }],
    },
  });
  expect(created.status()).toBe(201);
  const testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
  const student = { Authorization: `Bearer ${await apiToken(request, "e2e.student", "E2e-Pass-2026!")}` };
  expect((await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: student, data: { clientKey: crypto.randomUUID(), typedAnswer: "5" } })).status()).toBe(201);
  await withDb((c) => c.query(
    `UPDATE "Test" SET "closesAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second', "opensAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '2 hours' WHERE id = $1`, [testId]));
  const dist = await request.post(`/api/v1/admin/tests/${testId}/marking/distribute`, { headers: auth, data: { coachIds: [coachId] } });
  expect(dist.status()).toBe(200);
  expect((await dist.json()).assigned).toBe(1);
  code = await withDb(async (c) => (await c.query(`SELECT "publicCode" FROM "TestSubmission" WHERE "testId" = $1`, [testId])).rows[0].publicCode);
});

test("coach on a phone: Marking from the drawer, a code only, marks saved as a draft; no horizontal scrolling", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "coach");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Main menu" });
  await expect(drawer).toBeVisible();
  const link = drawer.locator('a[href="/mentor/marking"]');
  // The drawer's links are listed once it is open (checking the link earlier races the opening); a long menu keeps
  // some under "More", which exists only then.
  await expect(drawer.locator("a[href]").first()).toBeVisible();
  const more = drawer.getByTestId("sidebar-more-toggle");
  if (!(await link.isVisible()) && (await more.count()) > 0) await more.click();
  await link.click();
  await page.waitForURL(/\/mentor\/marking$/);
  const card = page.getByTestId(`queue-card-${code}`);
  await expect(card).toContainText(title);
  await noSeriousA11y(page);
  await card.click();
  await page.waitForURL(new RegExp(`/mentor/marking/${code}$`));
  await expect(page.getByRole("heading", { name: `Submission ${code}` })).toBeVisible();
  await expect(page.getByTestId("typed-answer-view")).toHaveText("5");
  await expect(page.locator("main").getByText(/e2e\.student|Student E2E/)).toHaveCount(0);
  await page.getByTestId("mark-q1").getByLabel("Marks (of 5)").fill("5");
  await page.getByTestId("save-draft").click();
  await expect(page.getByText(/^Draft saved/)).toBeVisible();
  await expect(page.getByTestId("running-total")).toHaveText("Total: 5 / 5");
  await noSeriousA11y(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
