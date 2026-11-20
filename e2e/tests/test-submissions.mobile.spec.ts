/**
 * Test Management, Phase 2 on a phone (Pixel 7): a student reaches My tests from the drawer, opens a test, answers it
 * with a typed answer and sees the version — one column, nothing wider than the screen.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Phone round ${run}`;

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

let testId: string;

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  const auth = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const maths = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()).find((s: { code: string }) => s.code === "MATHEMATICS").id;
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId: maths, division: "ALL", answerFormat: "TYPED_ONLY", maxMarks: 5,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 3_600_000).toISOString(),
      questions: [{ prompt: "What is 2 + 3?", maxMarks: 5 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
  expect((await request.post(`/api/v1/admin/tests/${testId}/publish`, { headers: auth })).status()).toBe(200);
});

test("student on a phone: My tests from the drawer, a typed answer, the version listed; no horizontal scrolling", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "student");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Main menu" });
  await expect(drawer).toBeVisible();
  const link = drawer.locator('a[href="/student/tests"]');
  if (!(await link.isVisible())) await drawer.getByTestId("sidebar-more-toggle").click();
  await link.click();
  await page.waitForURL(/\/student\/tests$/);
  await page.getByTestId(`my-test-${testId}`).click();
  await page.waitForURL(new RegExp(`/student/tests/${testId}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByTestId("typed-answer").fill("5");
  await page.getByTestId("submit-answer").click();
  await expect(page.getByText("Your answer was submitted: version 1.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("version-1")).toContainText("Current");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
