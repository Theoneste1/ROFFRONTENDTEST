/**
 * Page help (owner, 2026-11-26): the Help button on every signed-in page opens the guide for THAT page and role, with
 * technical support on WhatsApp (Theoneste, 0780 850 611), the credit "Made by Theoneste, Technology lead", and the full
 * guide as a PDF that starts from signing in. Closed by default: it opens only from the Help button.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test.describe("Page help", () => {
  test("administrator on Tests: the page's guide, support on WhatsApp, the credit, the PDF guide", async ({ page, request }) => {
    await signIn(page, "admin");
    await page.goto("/admin/tests");
    await page.getByTestId("page-help-button").click();
    const panel = page.getByTestId("page-help-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("page-help-topic")).toHaveText("Tests · for Administrators");
    await expect(panel.getByRole("heading", { name: "How this page works" })).toBeVisible();
    await expect(page.getByTestId("page-help-support")).toContainText("Theoneste");
    await expect(page.getByTestId("page-help-support")).toContainText("0780 850 611");
    const wa = await page.getByTestId("page-help-whatsapp").getAttribute("href");
    expect(wa).toMatch(/^https:\/\/wa\.me\/250780850611\?text=/);
    expect(decodeURIComponent(wa!.split("text=")[1])).toContain("(page: Tests)");
    await expect(page.getByTestId("page-help-credit")).toHaveText("Made by Theoneste, Technology lead");

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
    await expect(page.getByTestId("page-help-guide")).toHaveAttribute("href", "/admin/guide#tests");

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
