/**
 * The marking overviews (owner-approved designs 4 and 5, 2026-11-26), in a real browser against the real backend:
 *  1. The Administrator opens "Marking overview" from the menu: the five tiles, By subject, Recent tests and Coach
 *     workload show, and every number matches GET /admin/test-dashboard read with the Administrator's token.
 *  2. The Head Coach opens it from the coach portal menu: the four tiles, All papers by status, Marking progress per
 *     test, Outstanding marking and Coach workload show, scoped to the subjects they head, matching the API with the
 *     Head Coach's token. A coach without tests.review has no menu item.
 *  3. No serious accessibility violation; no horizontal page scroll at 375 px.
 * Fixtures (synthetic, unique per run): the e2e Head Coach heads Physics; a Physics test of this run closing in 30 days
 * (so it is among the dashboard's ten latest tests).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { PASSWORD } from "../support/accounts";
import { idOf, withDb } from "../support/db";
import { navigateViaSidebar, signIn } from "../support/session";

const run = Date.now().toString(36);
const title = `E2E Overview round ${run}`;
const STATUSES = ["SUBMITTED", "ASSIGNED", "MARKING_IN_PROGRESS", "MARKED", "RETURNED", "AWAITING_SECOND_MARKING", "APPROVED", "PUBLISHED"] as const;

type Counts = { total: number; byStatus: Partial<Record<(typeof STATUSES)[number], number>>; approved: number; published: number };
interface Dashboard {
  now: string;
  subjects: Array<{ subject: { id: string; code: string; name: string }; submissions: Counts; pendingReview: number; returned: number; awaitingSecondMarking: number; readyToPublish: number; authorisedMarkers: number; headCoaches: number }>;
  tests: Array<{ id: string; title: string; counts: Counts }>;
  coaches: Array<{ coach: { id: string }; assigned: number; marked: number }>;
}

let testId: string;

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

async function dashboard(request: APIRequestContext, token: string): Promise<Dashboard> {
  const r = await request.get("/api/v1/admin/test-dashboard", { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status()).toBe(200);
  return r.json();
}

/** The sums the page shows (lib/test-management/marking-overview.ts overviewTotals, written out independently). */
function sums(d: Dashboard) {
  const by = Object.fromEntries(STATUSES.map((s) => [s, d.subjects.reduce((a, x) => a + (x.submissions.byStatus[s] ?? 0), 0)])) as Record<(typeof STATUSES)[number], number>;
  const papers = d.subjects.reduce((a, x) => a + x.submissions.total, 0);
  const marked = by.MARKED + by.AWAITING_SECOND_MARKING + by.APPROVED + by.PUBLISHED;
  return {
    by, papers, marked,
    pct: papers > 0 ? Math.round((marked / papers) * 100) : 0,
    pendingReview: d.subjects.reduce((a, x) => a + x.pendingReview, 0),
    returned: d.subjects.reduce((a, x) => a + x.returned, 0),
    second: d.subjects.reduce((a, x) => a + x.awaitingSecondMarking, 0),
    ready: d.subjects.reduce((a, x) => a + x.readyToPublish, 0),
    approved: by.APPROVED + by.PUBLISHED,
  };
}

/** A tile shows its label and exactly this number (its own element: the hint beside it may start with a digit). */
async function expectTile(tile: Locator, label: string, value: number | string) {
  await expect(tile).toContainText(label, { ignoreCase: true });
  await expect(tile.getByTestId("tile-value")).toHaveText(String(value));
}

async function noSeriousA11y(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), undefined, { timeout: 5_000 }).catch(() => undefined);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  await withDb(async (c) => {
    const head = await idOf(c, "e2e.head");
    const physics = (await c.query<{ id: string }>(`SELECT id FROM "Discipline" WHERE code = 'PHYSICS'`)).rows[0].id;
    await c.query(
      `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source, "isActive") VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL', true)
       ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [head, physics]);
  });
  const admin = { Authorization: `Bearer ${await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!")}` };
  const physics = (await (await request.get("/api/v1/admin/tests/subjects", { headers: admin })).json()).find((s: { code: string }) => s.code === "PHYSICS").id;
  const created = await request.post("/api/v1/admin/tests", {
    headers: admin,
    data: {
      title, subjectId: physics, division: "ALL", answerFormat: "BOTH", maxMarks: 10,
      opensAt: new Date(Date.now() + 29 * 86_400_000).toISOString(), closesAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      questions: [{ prompt: "State Newton's first law.", maxMarks: 10 }],
    },
  });
  expect(created.status()).toBe(201);
  testId = (await created.json()).id;
});

test.describe.serial("marking overview", () => {
  test("Administrator: tiles, By subject, Recent tests and Coach workload match the dashboard API", async ({ page, request }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await navigateViaSidebar(page, "/admin/marking-overview");
    const root = page.getByTestId("marking-overview-admin");
    await expect(root.getByTestId("mo-subjects")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Marking overview" })).toBeVisible();
    const d = await dashboard(request, await apiToken(request, "admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!"));
    const s = sums(d);

    await expectTile(root.getByTestId("mo-papers"), "Papers submitted", s.papers);
    await expectTile(root.getByTestId("mo-progress"), "Marking progress", `${s.pct}%`);
    await expect(root.getByTestId("mo-progress")).toContainText(`${s.marked} of ${s.papers} marked`);
    await expectTile(root.getByTestId("mo-awaiting-review"), "Awaiting review", s.pendingReview);
    await expectTile(root.getByTestId("mo-approved"), "Approved", s.approved);
    await expectTile(root.getByTestId("mo-ready"), "Ready to publish", s.ready);

    // By subject: one row per subject, with the API's counts.
    await expect(root.getByTestId("mo-subjects").locator("tbody tr")).toHaveCount(Math.max(d.subjects.length, 1));
    for (const x of d.subjects) {
      const row = root.getByTestId(`mo-subject-${x.subject.code}`);
      await expect(row).toContainText(x.subject.name);
      await expect(row.getByTestId("mo-subject-review")).toHaveAttribute("data-count", String(x.pendingReview));
      await expect(row.getByTestId("mo-subject-returned")).toHaveAttribute("data-count", String(x.returned));
      await expect(row.getByTestId("mo-subject-ready")).toHaveAttribute("data-count", String(x.readyToPublish));
    }

    // Recent tests: the API's ten, including this run's test (no papers yet), each linking to its test page.
    const recent = root.getByTestId("mo-recent");
    await expect(recent.locator("tbody tr")).toHaveCount(d.tests.length);
    expect(d.tests.map((t) => t.id)).toContain(testId);
    const mine = recent.getByTestId(`mo-test-${testId}`);
    await expect(mine).toContainText(title);
    await expect(mine.getByTestId("mo-test-state")).toHaveText("No papers");
    await mine.getByRole("link", { name: `Open ${title}` }).click();
    await page.waitForURL(new RegExp(`/admin/tests/${testId}$`));
    await page.goBack();
    await expect(root.getByTestId("mo-coaches")).toBeVisible({ timeout: 30_000 });

    // Coach workload: the API's (at most 20) coaches.
    await expect(root.getByTestId("mo-coaches").locator("tbody tr[data-testid^='mo-coach-']")).toHaveCount(d.coaches.length);
    for (const c of d.coaches.slice(0, 5)) {
      const row = root.getByTestId(`mo-coach-${c.coach.id}`);
      await expect(row.getByTestId("mo-coach-assigned")).toHaveText(String(c.assigned));
      await expect(row.getByTestId("mo-coach-marked")).toHaveAttribute("data-count", String(c.marked));
    }

    // Actions in the header.
    await expect(page.getByTestId("mo-all-tests")).toHaveAttribute("href", "/admin/tests");
    await noSeriousA11y(page);
    await noHorizontalScroll(page);
  });

  test("Head Coach: tiles, All papers, per-test progress, Outstanding marking and Coach workload match the API (their subjects)", async ({ page, request }) => {
    test.setTimeout(180_000);
    await signIn(page, "headCoach");
    await navigateViaSidebar(page, "/mentor/marking-overview");
    const root = page.getByTestId("marking-overview-headCoach");
    await expect(root.getByTestId("mo-all-papers")).toBeVisible({ timeout: 30_000 });
    const d = await dashboard(request, await apiToken(request, "e2e.head", PASSWORD));
    const s = sums(d);

    // Scoped to the subjects headed (Physics among them), named in the description.
    expect(d.subjects.map((x) => x.subject.code)).toContain("PHYSICS");
    for (const x of d.subjects) await expect(page.getByText(/the subjects you head/)).toContainText(x.subject.name);

    await expectTile(root.getByTestId("mo-awaiting-review"), "Awaiting your review", s.pendingReview);
    await expectTile(root.getByTestId("mo-returned"), "Returned for correction", s.returned);
    await expectTile(root.getByTestId("mo-second"), "Second markings", s.second);
    await expectTile(root.getByTestId("mo-ready"), "Ready to publish", s.ready);

    // All papers by status: the total and the eight counts; the bar has a text summary.
    await expect(root.getByTestId("mo-papers-total")).toHaveText(String(s.papers));
    for (const st of STATUSES) await expect(root.getByTestId(`mo-status-${st}`)).toHaveAttribute("data-count", String(s.by[st]));
    await expect(root.getByTestId("mo-status-bar")).toHaveAttribute("role", "img");
    await expect(root.getByTestId("mo-status-bar")).toHaveAttribute("aria-label", s.papers > 0 ? new RegExp(`All ${s.papers} papers by status`) : /No papers yet/);

    // Marking progress per test: the API's tests, this run's among them; Open leads to the test page.
    const tests = root.getByTestId("mo-tests");
    await expect(tests.locator("tbody tr[data-testid^='mo-test-']")).toHaveCount(d.tests.length);
    for (const t of d.tests) {
      const row = tests.getByTestId(`mo-test-${t.id}`);
      await expect(row.getByTestId("mo-test-papers")).toHaveText(String(t.counts.total));
      await expect(row.getByTestId("mo-test-waiting")).toHaveAttribute("data-count", String(t.counts.byStatus.MARKED ?? 0));
      await expect(row.getByTestId("mo-test-unassigned")).toHaveAttribute("data-count", String(t.counts.byStatus.SUBMITTED ?? 0));
    }
    await expect(tests.getByTestId(`mo-test-${testId}`)).toContainText(title);

    // Outstanding marking: a card exactly for each count above zero.
    const outstanding: Array<[string, number]> = [["review", s.pendingReview], ["returned", s.returned], ["unassigned", s.by.SUBMITTED], ["second", s.second]];
    for (const [key, n] of outstanding) {
      if (n > 0) await expect(root.getByTestId(`mo-outstanding-${key}`)).toHaveAttribute("data-count", String(n));
      else await expect(root.getByTestId(`mo-outstanding-${key}`)).toHaveCount(0);
    }

    // Coach workload with the search.
    const coaches = root.getByTestId("mo-coaches");
    await expect(coaches.locator("tbody tr[data-testid^='mo-coach-']")).toHaveCount(d.coaches.length);
    await coaches.getByLabel("Search a coach").fill(`no-such-coach-${run}`);
    // Depends on the data: with coaches, the search found none; with none (a fresh database), the table says why it is empty.
    await expect(coaches.getByText(d.coaches.length > 0 ? "No coach matches." : "No papers are assigned to coaches yet.")).toBeVisible({ timeout: 10_000 });
    await coaches.getByLabel("Search a coach").fill("");
    if (d.coaches.length > 0) {
      const first = d.coaches[0].coach.id;
      await expect(coaches.getByTestId(`mo-coach-${first}`)).toBeVisible();
    }

    await tests.getByTestId(`mo-test-${testId}`).getByRole("link", { name: `Open ${title}` }).click();
    await page.waitForURL(new RegExp(`/mentor/tests/${testId}$`));
    await page.goBack();
    await expect(root.getByTestId("mo-all-papers")).toBeVisible({ timeout: 30_000 });
    await noSeriousA11y(page);
    await noHorizontalScroll(page);
  });

  test("a coach who only marks has no Marking overview in the menu, and the page and API refuse", async ({ page, request }) => {
    await signIn(page, "coach");
    const nav = page.getByTestId("sidebar-nav").first();
    await nav.locator("a[href]").first().waitFor();
    await expect(nav.locator('a[href="/mentor/marking-overview"]')).toHaveCount(0);
    // Opening the address directly: plain words, no figures (the API refuses too: tests.view).
    await page.goto("/mentor/marking-overview");
    await expect(page.getByText("The marking overview is for Head Coaches and Administrators.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mo-all-papers")).toHaveCount(0);
    const login = await request.post("/api/v1/auth/login", { data: { username: "e2e.coach", password: PASSWORD } });
    expect(login.status()).toBe(200);
    const r = await request.get("/api/v1/admin/test-dashboard", { headers: { Authorization: `Bearer ${(await login.json()).access_token}` } });
    expect([r.status(), (await r.json()).code]).toEqual([403, "PERMISSION_REQUIRED"]);
  });
});
