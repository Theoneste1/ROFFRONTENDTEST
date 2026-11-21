/**
 * Automated accessibility audit (PERF-03): axe-core (WCAG 2.0/2.1 A and AA rules) on the key pages of every portal and
 * the public pages. A page fails on any SERIOUS or CRITICAL violation; the failure lists each rule and its elements.
 * (Moderate / minor findings are reported in the test output but do not fail the run.)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "../support/session";
import type { AccountKey } from "../support/accounts";

const PAGES: Array<{ who: AccountKey | null; paths: string[] }> = [
  { who: null, paths: ["/", "/login", "/register", "/register/teacher", "/apply", "/forgot-password", "/support"] },
  { who: "admin", paths: ["/admin/dashboard", "/admin/users", "/admin/forms", "/admin/countries", "/admin/mentors", "/admin/schools", "/admin/courses"] },
  { who: "student", paths: ["/student/dashboard", "/student/courses", "/student/assignments", "/student/account", "/student/leaderboard"] },
  { who: "coach", paths: ["/mentor/dashboard", "/mentor/reviews", "/mentor/assignments", "/mentor/assignments/create"] },
  { who: "teacher", paths: ["/teacher/dashboard", "/teacher/account"] },
];

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = result.violations.filter((v) => !blocking.includes(v));
  if (minor.length) console.log(`${path}: ${minor.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(", ")}`);
  return blocking.map((v) => `${path} — ${v.id} [${v.impact}] ${v.help}\n    ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n    ")}`);
}

for (const { who, paths } of PAGES) {
  test(`no serious or critical accessibility violations — ${who ?? "public"} pages`, async ({ page }) => {
    test.setTimeout(240_000);
    if (who) await signIn(page, who);
    const problems: string[] = [];
    for (const p of paths) problems.push(...(await audit(page, p)));
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
