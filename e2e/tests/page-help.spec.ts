/**
 * Page help (owner, 2026-11-26): the Help button on every signed-in page opens the guide for THAT page and role, with
 * ROF's official support details (platform settings — never a personal name or number, owner 2026-11-28), neutral ROF
 * branding, the full guide inside the system and as a PDF. Closed by default: it opens only from the Help button.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";
import { setSupportSettings } from "../support/support-settings";

test.describe("Page help", () => {
  test("administrator on Tests: the page's guide, official ROF support, neutral branding, the PDF guide", async ({ page, request }) => {
    const restore = await setSupportSettings(request, { "platform.supportEmail": "support@rof.test", "support.phone": "0788 123 456", "support.hours": "Mon–Fri 8:00–17:00" });
    const panel = page.getByTestId("page-help-panel");
    try {
      await signIn(page, "admin");
      await page.goto("/admin/tests");
      await page.getByTestId("page-help-button").click();
      await expect(panel).toBeVisible();
      await expect(page.getByTestId("page-help-topic")).toHaveText("Tests · for Administrators");
      await expect(panel.getByRole("heading", { name: "How this page works" })).toBeVisible();
      // The official details from the platform settings, and WhatsApp with the official phone.
      const support = page.getByTestId("page-help-support");
      await expect(support).toContainText("ROF support");
      await expect(support).toContainText("support@rof.test");
      await expect(support).toContainText("0788 123 456");
      await expect(support).toContainText("Mon–Fri 8:00–17:00");
      await expect(page.getByTestId("page-help-whatsapp")).toHaveText("Ask on WhatsApp");
      const wa = await page.getByTestId("page-help-whatsapp").getAttribute("href");
      expect(wa).toMatch(/^https:\/\/wa\.me\/250788123456\?text=/);
      expect(decodeURIComponent(wa!.split("text=")[1])).toBe("Hello ROF support, I need help with ROF LMS (page: Tests).");
      await expect(page.getByTestId("page-help-support-page")).toHaveAttribute("href", "/support");
      // Neutral branding: no personal name, title or personal number anywhere in the panel.
      await expect(page.getByTestId("page-help-credit")).toHaveText("ROF LMS · Rwanda Olympiad Foundation");
      for (const personal of ["Theoneste", "Technology lead", "0780 850 611", "250780850611"]) {
        expect(await panel.innerHTML()).not.toContain(personal);
      }
    } finally {
      await restore();
    }

    const href = await page.getByTestId("page-help-download").getAttribute("href");
    expect(href).toBe("/help/guide/administrators.pdf");
    const pdf = await request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["content-disposition"]).toContain("ROF-LMS-guide-Administrators.pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Administrators get every role's documentation: one combined guide, and each role's guide.
    await expect(page.getByTestId("page-help-every-role")).toHaveAttribute("href", "/help/guide/every-role.pdf");
    const combined = await request.get("/help/guide/every-role.pdf");
    expect(combined.status()).toBe(200);
    expect(combined.headers()["content-disposition"]).toContain("ROF-LMS-guide-Every-role.pdf");
    expect((await combined.body()).length).toBeGreaterThan((await pdf.body()).length);
    // Each role's guide opens inside the system (owner, 2026-11-28); its PDF stays one click away beside it.
    const read = page.getByTestId("page-help-role-guide");
    await expect(read).toHaveCount(6);
    await expect(read.nth(2)).toHaveAttribute("href", "/admin/guide?for=COACH");
    await expect(read.nth(2)).toHaveText("Guide for Coaches");
    const pdfs = page.getByTestId("page-help-all-guides").getByRole("link", { name: /^Download the guide for / });
    await expect(pdfs).toHaveCount(6);
    await expect(pdfs.nth(2)).toHaveAttribute("href", "/help/guide/coaches.pdf");
    await expect(page.getByTestId("page-help-guide")).toHaveAttribute("href", "/admin/guide#admin-tests");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("page-help-button")).toBeFocused();
  });

  test("coach: the guide follows the page; an unknown guide is 404", async ({ page, request }) => {
    await signIn(page, "coach");
    await page.goto("/mentor/dashboard");
    await page.getByTestId("page-help-button").click();
    await expect(page.getByTestId("page-help-topic")).toHaveText("Dashboard · for Coaches");
    await expect(page.getByTestId("page-help-download")).toHaveAttribute("href", "/help/guide/coaches.pdf");
    await expect(page.getByTestId("page-help-all-guides")).toHaveCount(0);   // only administrators list every guide
    expect((await request.get("/help/guide/nobody.pdf")).status()).toBe(404);
  });

  test("closed by default: opens only from Help, and closes when the person moves to another page", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/student/courses");
    const panel = page.getByTestId("page-help-panel");
    await expect(page.getByTestId("page-help-button")).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.getByTestId("page-help-button").click();
    await expect(page.getByTestId("page-help-topic")).toHaveText("Courses · for Students");
    await page.goto("/student/leaderboard");
    await expect(page.getByTestId("page-help-button")).toBeVisible();
    await expect(panel).toHaveCount(0);
  });

  test("phone: the guide opens as a sheet and fits the screen", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    try {
      await signIn(page, "teacher");
      await page.goto("/teacher/dashboard");
      await page.getByTestId("page-help-button").click();
      const box = (await page.getByTestId("page-help-panel").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(844 + 0.5);
      await expect(page.getByTestId("page-help-topic")).toHaveText("My students · for Teachers");
    } finally {
      await ctx.close();
    }
  });
});
