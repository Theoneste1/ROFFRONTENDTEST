/**
 * The ROF logo opens the ROF LMS home page (owner, 2026-11-20), never the foundation's website: on the public home page
 * and on the pages outside the portals (the public card). For a signed-in person it signs out first (owner, 2026-11-28;
 * e2e/tests/logo-logout.spec.ts covers every role).
 */
import { expect, test } from "@playwright/test";
import { signIn } from "../support/session";

test("the logo opens the LMS home page: home page, a public page; in a portal it signs out, then opens the home page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const homeLogo = page.getByTestId("rof-logo-link").first();
  await expect(homeLogo).toHaveAttribute("href", "/");
  // A page outside the portals (the public card: here the page-not-found page).
  await page.goto("/no-such-page-for-the-logo-test");
  await expect(page.getByTestId("rof-logo-link").first()).toHaveAttribute("href", "/");

  await signIn(page, "student");
  const portalLogo = page.getByTestId("rof-logo-link").first();
  await expect(portalLogo).toHaveAttribute("href", "/");
  await expect(portalLogo).toHaveAttribute("data-signs-out", "true");
  await portalLogo.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/rwandaolympiadfoundation\.org/);
  await expect(page.getByTestId("rof-logo-link").first()).not.toHaveAttribute("data-signs-out", "true");
});

test("the browser tab shows the ROF logo and a clear title; search engines find the public pages, never the portals", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("ROF LMS · Rwanda Olympiad Foundation");
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute("href") ?? ""));
  expect(icons.some((h) => h.startsWith("/icon.png"))).toBe(true);
  expect(icons.some((h) => h.startsWith("/apple-icon.png"))).toBe(true);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Rwanda Olympiad Foundation/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/icon-512\.png$/);

  // The icons are the ROF logo (served as images), not the framework's default.
  for (const path of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/icon-512.png"]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()["content-type"], path).toMatch(/image\//);
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \//);
  for (const p of ["/admin/", "/student/", "/mentor/", "/teacher/"]) expect(robots).toContain(`Disallow: ${p}`);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const p of ["/login", "/register", "/apply", "/support"]) expect(sitemap).toContain(`${p}</loc>`);
  expect(sitemap).not.toContain("/admin");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "ROF LMS", theme_color: "#00428C" });
});
