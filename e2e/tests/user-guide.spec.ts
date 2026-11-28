/**
 * The user guide inside the system (owner, 2026-11-28: "easily accessible and viewable directly within the system,
 * rather than requiring users to download it every time"). For every role: the profile menu opens the role's guide as
 * a page (no download); it starts from signing in and explains every page, with contents, search and a link per
 * section. Help on any page opens the guide at that page's section. Administrators read every role's guide; nobody
 * else can switch to another role's. The PDF stays available as an option.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";
import type { AccountKey } from "../support/accounts";
import { setSupportSettings } from "../support/support-settings";

const ROLES: Array<{ who: AccountKey; path: string; audience: string }> = [
  { who: "student", path: "/student/guide", audience: "Students" },
  { who: "teacher", path: "/teacher/guide", audience: "Teachers" },
  { who: "coach", path: "/mentor/guide", audience: "Coaches" },
  { who: "headCoach", path: "/mentor/guide", audience: "Head Coaches" },
  { who: "admin", path: "/admin/guide", audience: "Administrators" },
  { who: "superAdmin", path: "/admin/guide", audience: "Super Administrators" },
];

async function openFromProfileMenu(page: Page) {
  await page.getByTestId("profile-menu-button").click();
  await page.getByRole("menuitem", { name: "User guide" }).click();
}

test.describe("User guide inside the system", () => {
  for (const { who, path, audience } of ROLES) {
    test(`${who}: the profile menu opens the guide as a page, from signing in to every page`, async ({ page }) => {
      await signIn(page, who);
      const downloads: string[] = [];
      page.on("download", (d) => downloads.push(d.suggestedFilename()));
      await openFromProfileMenu(page);
      await expect(page).toHaveURL(path);
      await expect(page.getByTestId("user-guide-title")).toHaveText(`ROF LMS for ${audience}`);
      // Getting started (signing in) first, then every page; the contents list every section.
      await expect(page.getByRole("heading", { level: 2, name: "Getting started" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Every page" })).toBeVisible();
      const topics = page.getByTestId("user-guide-topic");
      expect(await topics.count()).toBeGreaterThan(8);
      expect(await page.getByTestId("user-guide-contents").getByRole("link").count()).toBe(await topics.count());
      await expect(topics.first()).toContainText("Opening ROF LMS");
      await expect(topics.nth(1)).toContainText("Signing in");
      await expect(page.locator("#user-guide")).toBeVisible();   // the guide explains itself too
      // The PDF is an option, not the way to read it.
      await expect(page.getByTestId("user-guide-download")).toHaveAttribute("download", /\.pdf$/);
      expect(downloads).toEqual([]);
      // The footer: ROF support (official details; never a personal name or number), the PDF, Help and Support.
      const footer = page.getByTestId("user-guide-footer");
      await expect(footer).toContainText(`The user guide for ${audience.toLowerCase()}`);
      await expect(page.getByTestId("user-guide-footer-whatsapp")).toHaveText(/^\s*(Ask on WhatsApp|Contact ROF support)\s*$/);
      await expect(footer.getByRole("link", { name: "Help and Support" })).toHaveAttribute("href", "/support");
      for (const personal of ["Theoneste", "Technology lead", "0780 850 611", "250780850611"]) {
        expect(await page.getByTestId("user-guide").innerHTML()).not.toContain(personal);
      }
    });
  }

  test("search filters the sections and the contents; nothing found says so", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/student/guide");
    const topics = page.getByTestId("user-guide-topic");
    await expect(page.getByTestId("user-guide-title")).toBeVisible();
    const all = await topics.count();
    expect(all).toBeGreaterThan(8);
    await page.getByTestId("user-guide-search").fill("password");
    await expect.poll(() => topics.count()).toBeLessThan(all);
    for (const text of await topics.allInnerTexts()) expect(text.toLowerCase()).toContain("password");
    expect(await page.getByTestId("user-guide-contents").getByRole("link").count()).toBe(await topics.count());
    await page.getByTestId("user-guide-search").fill("zzqx nothing here");
    await expect(topics).toHaveCount(0);
    await expect(page.getByTestId("user-guide-empty")).toBeVisible();
    await page.getByTestId("user-guide-search").fill("");
    await expect(topics).toHaveCount(all);
  });

  test("Help on a page opens the guide at that page's section", async ({ page }) => {
    await signIn(page, "coach");
    await page.goto("/mentor/dashboard");
    await page.getByTestId("page-help-button").click();
    await page.getByTestId("page-help-guide").click();
    await expect(page).toHaveURL("/mentor/guide#coach-dashboard");
    await expect(page.locator("#coach-dashboard")).toBeInViewport();
    await expect(page.locator("#coach-dashboard")).toContainText("Dashboard");
  });

  test("Administrators read every role's guide; others always get their own", async ({ page, browser }) => {
    await signIn(page, "admin");
    await page.goto("/admin/guide");
    const roles = page.getByTestId("user-guide-roles").getByRole("link");
    await expect(roles).toHaveCount(6);
    await roles.filter({ hasText: "Coaches" }).first().click();
    await expect(page).toHaveURL("/admin/guide?for=COACH");
    await expect(page.getByTestId("user-guide-title")).toHaveText("ROF LMS for Coaches");
    await expect(page.locator("#coach-dashboard")).toBeVisible();

    const ctx = await browser.newContext();
    const student = await ctx.newPage();
    await signIn(student, "student");
    await student.goto("/student/guide?for=ADMIN");
    await expect(student.getByTestId("user-guide-title")).toHaveText("ROF LMS for Students");
    await expect(student.getByTestId("user-guide-roles")).toHaveCount(0);
    await ctx.close();
  });

  test("ROF support: WhatsApp with the official phone when one is set; otherwise the Help and Support page", async ({ page, request }) => {
    let restore = await setSupportSettings(request, { "support.phone": "+250 788 765 432" });
    try {
      await signIn(page, "teacher");
      await page.goto("/teacher/guide");
      const button = page.getByTestId("user-guide-footer-whatsapp");
      await expect(button).toHaveText("Ask on WhatsApp");
      expect(decodeURIComponent((await button.getAttribute("href"))!)).toBe("https://wa.me/250788765432?text=Hello ROF support, I need help with ROF LMS (page: User guide).");
    } finally {
      await restore();
    }
    restore = await setSupportSettings(request, { "support.phone": null });
    try {
      await page.reload();
      const button = page.getByTestId("user-guide-footer-whatsapp");
      await expect(button).toHaveText("Contact ROF support");
      await expect(button).toHaveAttribute("href", "/support");
    } finally {
      await restore();
    }
  });
});
