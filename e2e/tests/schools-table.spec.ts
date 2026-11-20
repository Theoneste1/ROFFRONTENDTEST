/**
 * Schools table (2026-11-19), in a real browser against the real backend and PostgreSQL:
 * columns in the agreed order; search; filters (status, district, sector); sort by school name and by the number of
 * verified students (server-side); pagination; all kept in the URL; a row opens the school's page; the primary teacher
 * links to their account; on a phone the table scrolls sideways inside its own container (the page never does).
 * Fixtures (fresh per run, synthetic): 25 schools named "E2E Tbl <run> …" — Alpha (Huye / Ngoma, 3 verified students, a
 * primary teacher), Bravo (Huye / Tumba, 1 pending claim only), Charlie (no district or sector, 1 verified, inactive)
 * and 22 fillers (Huye / Ngoma, nobody).
 */
import { expect, test, type Page } from "@playwright/test";
import { hashSync } from "bcryptjs";
import type pg from "pg";
import { PASSWORD } from "../support/accounts";
import { claim, createStudent, idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const prefix = `E2E Tbl ${run}`;
const name = { a: `${prefix} Alpha`, b: `${prefix} Bravo`, c: `${prefix} Charlie` };
const teacher = { username: `e2e.tbl.${run}`, firstName: `Tabla${run}`, lastName: "Primary" };
const ids: Record<string, string> = {};

async function school(c: pg.Client, n: string, place: { district: string | null; sector: string | null }, extra: { active?: boolean; code?: string | null } = {}) {
  return (await c.query<{ id: string }>(
    `INSERT INTO "School" (id, name, location, "countryCode", province, district, sector, code, "isActive", source)
     VALUES (gen_random_uuid()::text, $1, 'Huye', 'RW', $2, $3, $4, $5, $6, 'ADMIN') RETURNING id`,
    [n, place.district ? "Southern Province" : null, place.district, place.sector, extra.code ?? null, extra.active ?? true],
  )).rows[0].id;
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    ids.a = await school(c, name.a, { district: "Huye", sector: "Ngoma" }, { code: String(900000 + (Date.now() % 99999)) });
    ids.b = await school(c, name.b, { district: "Huye", sector: "Tumba" });
    ids.c = await school(c, name.c, { district: null, sector: null }, { active: false });
    for (let i = 0; i < 22; i++) await school(c, `${prefix} Zulu ${String(i).padStart(2, "0")}`, { district: "Huye", sector: "Ngoma" });
    for (let i = 0; i < 3; i++) await createStudent(c, `e2e.tbl.a${i}.${run}`, `TblA${i}`, ids.a, "VERIFIED");
    await createStudent(c, `e2e.tbl.b.${run}`, "TblB", ids.b, "PENDING");
    const cStudent = await createStudent(c, `e2e.tbl.c.${run}`, "TblC", ids.b, "PENDING");
    // Charlie's student: first claimed Bravo (now superseded), then verified at Charlie.
    await c.query(`UPDATE "StudentSchoolAffiliation" SET "supersededAt" = now() WHERE "studentId" = $1`, [cStudent]);
    await claim(c, cStudent, ids.c, "VERIFIED");
    ids.teacher = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'TEACHER', $5, now(), true, now()) RETURNING id`,
      [teacher.username, teacher.firstName, teacher.lastName, `${teacher.username}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    await c.query(
      `INSERT INTO "TeacherSchoolAssignment" (id, "teacherId", "schoolId", "assignedById", role) VALUES (gen_random_uuid()::text, $1, $2, $3, 'PRIMARY')`,
      [ids.teacher, ids.a, await idOf(c, "admin")],
    );
  });
});

test.describe.serial("Schools table", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(page, "admin");
  });
  test.afterAll(async () => page.close());

  const rows = () => page.getByTestId("school-row");
  const row = (n: string) => rows().filter({ hasText: n });
  const firstName = () => rows().first().getByTestId("school-name");
  const search = async () => {
    await page.goto("/admin/schools");
    await page.getByRole("searchbox", { name: "Search schools by name or code" }).fill(prefix);
    await expect(page).toHaveURL(/q=E2E\+Tbl/);
    await expect(page.getByTestId("school-count")).toHaveText("25 schools match the filters");
  };

  test("columns in the agreed order; values, \"—\" and \"No primary teacher\"", async () => {
    await search();
    // Bulk actions (bulkOperationsGeneric) add a selection column first; the agreed columns follow in their order.
    const head = page.getByTestId("schools-table-head");
    if (await head.getByTestId("bulk-select-col").count()) await expect(head.locator("th").first()).toHaveAttribute("data-testid", "bulk-select-col");
    const headers = (await head.locator('th:not([data-testid="bulk-select-col"])').allInnerTexts()).map((t) => t.trim()).slice(0, 8);
    expect(headers.map((h) => h.toUpperCase())).toEqual(
      ["School code", "School name", "Country", "District", "Sector", "Number of students", "Primary teacher", "Status"].map((h) => h.toUpperCase()),
    );
    const a = row(name.a);
    await expect(a.getByTestId("school-code")).toHaveText(/^9\d{5}$/);
    await expect(a.getByTestId("school-country")).toHaveText("Rwanda");
    await expect(a.getByTestId("school-district")).toHaveText("Huye");
    await expect(a.getByTestId("school-sector")).toHaveText("Ngoma");
    await expect(a.getByTestId("school-students")).toHaveText("3");
    await expect(a.getByTestId("school-primary-teacher")).toHaveText(`${teacher.firstName} ${teacher.lastName}`);
    await expect(a.getByTestId("school-status")).toHaveText("Active");
    const c = row(name.c);
    await expect(c.getByTestId("school-code")).toHaveText("—");
    await expect(c.getByTestId("school-district")).toHaveText("—");
    await expect(c.getByTestId("school-sector")).toHaveText("—");
    await expect(c.getByTestId("school-students")).toHaveText("1");
    await expect(c.getByTestId("school-primary-teacher")).toHaveText("No primary teacher");
    await expect(c.getByTestId("school-status")).toHaveText("Inactive");
    // A pending claim (and a superseded one) is not a verified student.
    await expect(row(name.b).getByTestId("school-students")).toHaveText("0");
  });

  test("filters: status, then district and sector; kept in the URL", async () => {
    await search();
    await page.getByLabel("Status").selectOption("inactive");
    await expect(page).toHaveURL(/status=inactive/);
    await expect(rows()).toHaveCount(1);
    await expect(firstName()).toContainText(name.c);
    await page.getByLabel("Status").selectOption("all");
    await page.getByLabel("Province").selectOption("Southern Province");
    await page.getByLabel("District").selectOption("Huye");
    await expect(page).toHaveURL(/district=Huye/);
    await expect(page.getByTestId("school-count")).toHaveText("24 schools match the filters");
    await page.getByLabel("Sector").selectOption("Tumba");
    await expect(page).toHaveURL(/sector=Tumba/);
    await expect(rows()).toHaveCount(1);
    await expect(firstName()).toContainText(name.b);
    // Reloading keeps every filter.
    await page.reload();
    await expect(rows()).toHaveCount(1);
    await expect(page.getByLabel("Sector")).toHaveValue("Tumba");
  });

  test("sort by number of students (server-side, desc then asc) and by name; kept with the filters and pagination", async () => {
    await search();
    await page.getByTestId("sort-verifiedStudents").click();
    await expect(page).toHaveURL(/sort=verifiedStudents&order=desc/);
    await expect(firstName()).toContainText(name.a);
    await expect(rows().nth(1).getByTestId("school-name")).toContainText(name.c);
    await expect(page.getByRole("columnheader", { name: /Number of students/ })).toHaveAttribute("aria-sort", "descending");
    await page.getByTestId("sort-verifiedStudents").click();
    await expect(page).not.toHaveURL(/order=desc/);
    await expect(rows().first().getByTestId("school-students")).toHaveText("0");
    // Page 2 keeps the sort: the schools with students come last.
    await page.getByRole("navigation", { name: "Pagination" }).getByRole("button", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/sort=verifiedStudents/);
    await expect(rows()).toHaveCount(5);
    await expect(rows().nth(3).getByTestId("school-name")).toContainText(name.c);
    await expect(rows().nth(4).getByTestId("school-name")).toContainText(name.a);
    // A filter keeps the sort and returns to page 1.
    await page.getByLabel("Status").selectOption("active");
    await expect(page).toHaveURL(/status=active/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/sort=verifiedStudents/);
    // By name, descending: the fillers first.
    await page.getByTestId("sort-name").click();
    await expect(page).not.toHaveURL(/sort=/);   // name, ascending: the default, so not in the URL
    await page.getByTestId("sort-name").click();
    await expect(page).toHaveURL(/order=desc/);
    await expect(firstName()).toContainText(`${prefix} Zulu 21`);
  });

  test("a row opens the school's page; the primary teacher links to their account", async () => {
    await search();
    await row(name.a).getByTestId("school-district").click();
    await expect(page).toHaveURL(new RegExp(`/admin/schools/${ids.a}$`));
    await page.goBack();
    await row(name.a).getByTestId("school-primary-teacher").getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${ids.teacher}$`));
  });

  test("on a phone the table scrolls sideways inside its own container; the page does not", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await search();
    const scroller = page.getByTestId("schools-table-scroll");
    const box = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(box.scroll).toBeGreaterThan(box.client);
    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    // The page scrolls down to the table (the bulk toolbar may push it below the fold); only vertically, so the
    // sideways position checked next is the table's own.
    await scroller.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 80));
    await expect(rows().first().getByRole("link", { name: /^View / })).toBeInViewport();
    const pageWidth = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(pageWidth.doc).toBeLessThanOrEqual(pageWidth.win);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
});
