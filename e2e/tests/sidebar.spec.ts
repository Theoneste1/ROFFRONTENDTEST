/**
 * Sidebar "More" menu (all portals), in a real browser against the real backend:
 * - with room, every item is shown and there is no "More";
 * - on a short screen the same items are split between the sidebar and "More" — none lost, none duplicated;
 * - "More" opens and closes (click, Escape), its links navigate, and the current page under "More" is highlighted
 *   and named on the button;
 * - the sidebar itself never scrolls;
 * - each role sees only its own portal's items.
 * One sign-in per role (the backend allows 10 sign-ins a minute per address; refresh tokens rotate, so sessions are
 * not replayed between contexts): the tests of a role share one page.
 */
import { expect, test, type Page } from "@playwright/test";
import { navigateViaSidebar, signIn, sidebarHrefs } from "../support/session";

test.describe.serial("Administrator sidebar", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  test("tall screen: every item shown, no More; short screen: same items split, none lost or duplicated", async () => {
    await page.setViewportSize({ width: 1440, height: 2000 });
    await page.goto("/admin/dashboard");
    const tall = await sidebarHrefs(page);
    expect(tall.more).toEqual([]);
    await expect(page.getByTestId("sidebar-more-toggle")).toHaveCount(0);
    expect(tall.direct.length).toBeGreaterThanOrEqual(10);

    await page.setViewportSize({ width: 1280, height: 640 });
    await expect(page.getByTestId("sidebar-more-toggle")).toBeVisible();
    const short = await sidebarHrefs(page);
    expect(short.more.length).toBeGreaterThan(0);
    expect(short.direct.length).toBeLessThan(tall.direct.length);
    expect([...short.all].sort()).toEqual([...tall.direct].sort());
    expect(new Set(short.all).size).toBe(short.all.length);

    // The sidebar does not scroll.
    const scrolls = await page.getByTestId("portal-sidebar").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrolls).toBe(false);
  });

  test("More opens and closes, navigates, and marks the current page", async () => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto("/admin/dashboard");
    const toggle = page.getByTestId("sidebar-more-toggle");
    const panel = page.getByTestId("sidebar-more-panel");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(panel).toBeVisible();
    await toggle.click();
    await expect(panel).toBeHidden();

    await toggle.click();
    const target = panel.locator("a[href]").last();
    const href = (await target.getAttribute("href"))!;
    const label = ((await target.textContent()) ?? "").trim();   // textContent: independent of the panel's layout timing
    await target.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?|$)`));
    await expect(panel).toBeHidden();
    // The current page is under More: the button is highlighted and names it; inside, the link is aria-current.
    await expect(page.getByTestId("sidebar-more-current")).toHaveText(label);
    await toggle.click();
    await expect(panel.locator(`a[href="${href}"]`)).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
  });

  test("a link outside More is the active one when its page is open", async () => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto("/admin/users");
    const nav = page.getByTestId("sidebar-nav").first();
    await expect(nav.locator(':scope > a[href="/admin/users"]')).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("sidebar-more-current")).toHaveCount(0);
  });
});

const PORTALS = [
  { who: "coach", home: "/mentor/dashboard", prefix: "/mentor/" },
  { who: "headCoach", home: "/mentor/dashboard", prefix: "/mentor/" },
  { who: "teacher", home: "/teacher/dashboard", prefix: "/teacher/" },
  { who: "student", home: "/student/dashboard", prefix: "/student/" },
] as const;

for (const c of PORTALS) {
  test(`${c.who}: only ${c.prefix} items, each one navigates`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await signIn(page, c.who);
    // Sign-in lands on the portal: no reload (each full load refreshes the session; the backend allows 30 a minute).
    await page.waitForURL((u) => u.pathname.startsWith(c.prefix));
    // Group sub-links too (e.g. the student's Assignments group).
    const { all: items, children } = await sidebarHrefs(page, { openGroups: true });
    const all = [...new Set([...items, ...children])];
    expect(all.length).toBeGreaterThan(0);
    for (const href of all) expect(href.startsWith(c.prefix), href).toBe(true);
    for (const href of all) {
      await navigateViaSidebar(page, href);   // clicks the link (client-side), as a user does
      await expect(page.getByTestId("sidebar-nav").first()).toBeVisible();
      await expect(page).not.toHaveURL(/no-access|\/login/);
    }
    await page.close();
  });
}

/**
 * Regression (More panel clipped under the top header): the panel is anchored at the bottom of the More button and
 * grows upwards; it must stop 8 px below the header, scroll inside when the items do not fit, stay attached to More,
 * and keep the page and the sidebar still — on short and laptop heights and after resizing while open.
 */
test.describe("More panel stays below the top header", () => {
  test("laptop and short heights, resizing while open: first item visible, last reachable, attached, scrolls inside, page still", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
    try {
      await signIn(page, "admin");
      await page.goto("/admin/dashboard");
      const toggle = page.getByTestId("sidebar-more-toggle");
      const panel = page.getByTestId("sidebar-more-panel");
      const items = panel.locator("a[href], button");
      const headerBottom = async () => {
        const h = (await page.getByTestId("portal-topbar").boundingBox())!;
        return h.y + h.height;
      };
      const scrollState = () =>
        page.evaluate(() => ({ page: window.scrollY, sidebar: document.querySelector('[data-testid="portal-sidebar"]')?.scrollTop ?? 0 }));

      /** One viewport height: open the panel if needed, then check every rule. Returns whether the panel scrolls (null: no More at this height). */
      const verify = async (height: number) => {
        await page.setViewportSize({ width: 1280, height });
        // The sidebar re-measures after a resize: wait for More (a tall window may have none: then nothing to check).
        const hasMore = await toggle.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false);
        if (!hasMore) return null;
        const before = await scrollState();
        if (!(await panel.isVisible())) await toggle.click();
        await expect(panel).toBeVisible();
        // Top edge: at least 8 px below the header (re-measured after a resize).
        await expect.poll(async () => (await panel.boundingBox())!.y - (await headerBottom()), { timeout: 5_000 }).toBeGreaterThanOrEqual(8 - 0.5);
        const box = (await panel.boundingBox())!;
        const more = (await page.getByTestId("sidebar-more").boundingBox())!;
        expect(Math.abs(box.y + box.height - (more.y + more.height)), `${height}px: attached to More`).toBeLessThanOrEqual(1);
        // First item: fully visible, below the header.
        await panel.evaluate((el) => el.scrollTo({ top: 0 }));
        expect((await items.first().boundingBox())!.y, `${height}px: first item below the header`).toBeGreaterThanOrEqual(await headerBottom());
        await expect(items.first()).toBeInViewport({ ratio: 1 });
        const m = await panel.evaluate((el) => ({
          scrolls: el.scrollHeight > el.clientHeight + 1,
          overflowY: getComputedStyle(el).overflowY,
          overscroll: getComputedStyle(el).overscrollBehaviorY,
        }));
        expect(m.overflowY).toBe("auto");
        expect(m.overscroll).toBe("contain");
        // Last item: reachable by scrolling inside the panel; scrolling past the end moves neither the page nor the sidebar.
        await panel.hover();
        await page.mouse.wheel(0, 4000);
        const last = panel.locator("a[href]").last();
        await last.scrollIntoViewIfNeeded();
        await expect(last).toBeInViewport();
        expect(await scrollState(), `${height}px: page and sidebar did not scroll`).toEqual(before);
        return m.scrolls;
      };

      expect(await verify(480), "480px: the items do not fit, so the panel scrolls").toBe(true);
      await verify(560); // resized while open
      await verify(640);
      await verify(768); // common laptop height
      const at900 = await verify(900);
      if (at900 !== null) expect(at900, "900px: a list that fits shows no scrollbar").toBe(false);
      const at1100 = await verify(1100);
      if (at1100 !== null) expect(at1100).toBe(false);
      await page.setViewportSize({ width: 1280, height: 640 });
      if (await panel.isVisible()) {
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
      }
    } finally {
      await page.close();
    }
  });
});
