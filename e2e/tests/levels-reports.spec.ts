/**
 * Olympiad levels, administrator-managed divisions, the Student Profile Overview, configurable user tables, custom
 * reports and bulk course assignment (owner 2026-11-21/22), in a real browser against the real backend and PostgreSQL.
 *  1. Divisions: the grade map shows every grade's division and Middle; a new division is created, then deactivated.
 *  2. A student's Olympiad level: the photo (initials) on the user page; set Middle by hand with a reason; the history
 *     shows who and why; the profile shows the level and the school name only — never the date of birth.
 *  3. Another student opens the profile (basic information, no account status).
 *  4. The Users list: per-role columns (Olympiad level shown, username hidden by default), a saved personal layout, and
 *     sorting by Last login.
 *  5. A custom report from an example: preview, save, share with Teachers (View); the teacher opens it without export.
 *  6. Coach course assignment: "All Junior courses" previews the pairs before anything is assigned.
 * Every change is checked in the database. Fixtures are synthetic and unique per run.
 */
import { expect, test } from "@playwright/test";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const code = `E2E_${run.toUpperCase()}`.slice(0, 30);
const studentUser = `e2e.lv.${run}`;
const studentFirst = `Lena${run}`;
const schoolName = `E2E Level School ${run}`;
const reportName = `E2E never logged in ${run}`;
let studentId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    const school = await createSchool(c, schoolName);
    studentId = await createStudent(c, studentUser, studentFirst, school, "VERIFIED");
  });
});

test("divisions: grade map, a new division, deactivation", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/divisions");
  await expect(page.getByTestId("grade-map")).toContainText("S1");
  await expect(page.getByTestId("division-MIDDLE")).toBeVisible();
  await page.getByTestId("new-division").click();
  const form = page.getByTestId("new-division-form");
  await form.getByLabel("Code (permanent)").fill(code);
  await form.getByLabel("Name", { exact: true }).fill(`Advanced ${run}`);
  await page.getByTestId("create-division").click();
  const card = page.getByTestId(`division-${code}`);
  await expect(card).toBeVisible();
  await card.getByTestId(`toggle-division-${code}`).click();
  await expect(card).toContainText("Inactive");
  const row = await withDb(async (c) => (await c.query(`SELECT "isActive" FROM "Division" WHERE code = $1`, [code])).rows[0]);
  expect(row.isActive).toBe(false);
});

test("a student's Olympiad level: photo, set by hand with history, shown on the profile", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto(`/admin/users/${studentId}`);
  await expect(page.getByTestId("avatar-tile")).toHaveAttribute("data-avatar", "generated");
  const card = page.getByTestId("olympiad-level-card");
  await expect(card.getByTestId("olympiad-level-current")).toBeVisible();
  const middle = await withDb(async (c) => (await c.query(`SELECT id FROM "Division" WHERE code = 'MIDDLE'`)).rows[0].id as string);
  await card.getByTestId("olympiad-level-choice").selectOption(middle);
  await card.getByTestId("olympiad-level-reason").fill("Teacher submits for the Middle class");
  await card.getByTestId("olympiad-level-save").click();
  await expect(card.getByTestId("olympiad-level-current")).toHaveText("Middle — set by hand");
  await expect(card.getByTestId("olympiad-level-history")).toContainText("Teacher submits for the Middle class");
  const u = await withDb(async (c) => (await c.query(`SELECT d.code, u."divisionManual" FROM "User" u JOIN "Division" d ON d.id = u."divisionId" WHERE u.id = $1`, [studentId])).rows[0]);
  expect(u).toEqual({ code: "MIDDLE", divisionManual: true });
  const history = await withDb(async (c) => (await c.query(`SELECT source, reason, "changedById" IS NOT NULL AS by FROM "DivisionChange" WHERE "studentId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [studentId])).rows[0]);
  expect(history).toEqual({ source: "MANUAL", reason: "Teacher submits for the Middle class", by: true });

  await page.getByTestId("open-student-profile").click();
  const header = page.getByTestId("student-profile-header");
  await expect(header.getByTestId("profile-name")).toContainText(studentFirst);
  await expect(header.getByTestId("profile-level")).toHaveText("Middle");
  await expect(header.getByTestId("profile-school")).toHaveText(schoolName);
  await expect(header.getByTestId("profile-status")).toHaveText("Active");
  await expect(header).not.toContainText("2012");
  await expect(header).not.toContainText("Official directory");
});

test("another student sees the basic profile, without the account status", async ({ page }) => {
  await signIn(page, "student");
  await page.goto(`/student/profiles/${studentId}`);
  const header = page.getByTestId("student-profile-header");
  await expect(header.getByTestId("profile-name")).toContainText(studentFirst);
  await expect(header.getByTestId("profile-photo")).toHaveAttribute("data-avatar", "generated");
  await expect(header.getByTestId("profile-status")).toHaveCount(0);
  await expect(page.getByTestId("olympiad-level-card")).toHaveCount(0);
});

test("Users list: per-role columns, a saved layout, sorting by last login", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/users?role=STUDENT");
  await expect(page.getByRole("columnheader", { name: "Olympiad level" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Last login" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Username" })).toHaveCount(0);

  await page.getByTestId("choose-columns").click();
  await page.getByTestId("column-username").check();
  await page.getByTestId("save-my-layout").click();
  await expect(page.getByRole("columnheader", { name: "Username" })).toBeVisible();
  const adminId = await withDb((c) => idOf(c, "admin"));
  const saved = await withDb(async (c) => (await c.query(`SELECT columns FROM "TableLayout" WHERE owner = $1 AND "table" = 'users.students'`, [adminId])).rows[0]);
  expect((saved.columns as Array<{ key: string; visible: boolean }>).find((x) => x.key === "username")?.visible).toBe(true);

  await page.getByTestId("choose-columns").click();
  await page.getByTestId("reset-my-layout").click();
  await expect(page.getByRole("columnheader", { name: "Username" })).toHaveCount(0);

  await page.getByTestId("sort-lastLoginAt").click();
  await expect(page).toHaveURL(/sort=lastLoginAt/);
  await expect(page.getByRole("columnheader", { name: "Last login" })).toHaveAttribute("aria-sort", "descending");
});

test("custom report: example, preview, save, share with Teachers (View)", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/reports");
  await page.getByTestId("open-custom-reports").click();
  await expect(page).toHaveURL(/\/admin\/custom-reports$/);
  await page.getByTestId("new-report").click();
  await page.getByTestId("report-templates").getByRole("button", { name: "Never logged in" }).click();
  await page.getByTestId("report-name").fill(reportName);
  await page.getByTestId("report-preview").click();
  await expect(page.getByTestId("report-table")).toBeVisible();
  await page.getByTestId("report-save").click();
  await expect(page.getByTestId("report-viewer")).toContainText(reportName);
  await expect(page.getByTestId("export-csv")).toBeVisible();

  await page.getByTestId("share-report").click();
  await page.getByTestId("share-role").selectOption("TEACHER");
  await page.getByTestId("share-save").click();
  const grant = await withDb(async (c) => (await c.query(
    `SELECT g."canView", g."canDownload", g."canEdit" FROM "CustomReportGrant" g JOIN "CustomReport" r ON r.id = g."reportId" WHERE r.name = $1 AND g.grantee = 'role:TEACHER'`, [reportName],
  )).rows[0]);
  expect(grant).toEqual({ canView: true, canDownload: false, canEdit: false });
});

test("the teacher opens the shared report: rows, but no export and no sharing", async ({ page }) => {
  await signIn(page, "teacher");
  await page.goto("/teacher/reports");
  await page.getByRole("link", { name: new RegExp(reportName) }).click();
  await expect(page.getByTestId("report-viewer")).toContainText(reportName);
  await expect(page.getByTestId("report-table")).toBeVisible();
  await expect(page.getByTestId("export-csv")).toHaveCount(0);
  await expect(page.getByTestId("share-report")).toHaveCount(0);
});

test("coach course assignment: All Junior courses is previewed before anything is assigned", async ({ page }) => {
  await signIn(page, "admin");
  const coachId = await withDb((c) => idOf(c, "e2e.coach"));
  const before = await withDb(async (c) => Number((await c.query(`SELECT count(*) FROM "MentorAssignment" WHERE "mentorId" = $1`, [coachId])).rows[0].count));
  await page.goto(`/admin/mentors?mentor=${coachId}`);
  const section = page.getByTestId("bulk-assign");
  const junior = await withDb(async (c) => (await c.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR'`)).rows[0].id as string);
  await section.getByTestId("bulk-assign-choice").selectOption(`DIVISION:${junior}`);
  await section.getByTestId("bulk-assign-preview").click();
  await expect(section.getByTestId("bulk-assign-result")).toContainText("new");
  const after = await withDb(async (c) => Number((await c.query(`SELECT count(*) FROM "MentorAssignment" WHERE "mentorId" = $1`, [coachId])).rows[0].count));
  expect(after).toBe(before);
});
