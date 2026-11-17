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
import { signIn, sidebarHrefs } from "../support/session";

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
    const label = (await target.innerText()).trim();
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
    await page.goto(c.home);
    const { all } = await sidebarHrefs(page);
    expect(all.length).toBeGreaterThan(0);
    for (const href of all) expect(href.startsWith(c.prefix), href).toBe(true);
    for (const href of all) {
      await page.goto(href);
      await expect(page.getByTestId("sidebar-nav").first()).toBeVisible();
      await expect(page).not.toHaveURL(/no-access|\/login/);
    }
    await page.close();
  });
}
