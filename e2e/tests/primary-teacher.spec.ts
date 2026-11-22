/**
 * Primary teacher of a school (owner decision 2026-11-19), in a real browser against the real backend and PostgreSQL.
 * The primary teacher is the school's MAIN CONTACT only — primary and secondary teachers have the same rights.
 *  1. the school's Teachers tab shows the primary teacher and a Primary / Secondary badge on each current teacher;
 *  2. the Administrator makes the secondary teacher primary (confirm dialog): the previous primary becomes secondary;
 *  3. the badge (and the school) appear on the teacher's admin page and in the Users list; the teacher sees it on their own profile;
 *  4. ending the primary's school assignment leaves the school with "No primary teacher" (nobody is promoted).
 * Fixtures (fresh per run, synthetic): a school; a teacher created for this run as its PRIMARY and the e2e Teacher as
 * SECONDARY (database links with an explicit role — what an Administrator's assignments produce).
 */
import { expect, test, type Page } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { PASSWORD } from "../support/accounts";
import { createSchool, idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const run = Date.now().toString(36);
const school = `E2E Primary School ${run}`;
const first = { username: `e2e.pt.${run}`, firstName: `Prima${run}`, lastName: "Teacher" };
let schoolId: string;
let firstId: string;
let teacherId: string;

test.beforeAll(async () => {
  await withDb(async (c) => {
    schoolId = await createSchool(c, school);
    const admin = await idOf(c, "admin");
    teacherId = await idOf(c, "e2e.teacher");
    firstId = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'TEACHER', $5, now(), true, now()) RETURNING id`,
      [first.username, first.firstName, first.lastName, `${first.username}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    const link = (t: string, role: "PRIMARY" | "SECONDARY", at: string) => c.query(
      `INSERT INTO "TeacherSchoolAssignment" (id, "teacherId", "schoolId", "assignedById", role, "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4::"TeacherSchoolRole", $5)`,
      [t, schoolId, admin, role, at],
    );
    await link(firstId, "PRIMARY", "2026-01-01T08:00:00Z");
    await link(teacherId, "SECONDARY", "2026-01-02T08:00:00Z");
  });
});

test.describe.serial("Primary teacher", () => {
  let admin: Page;
  test.beforeAll(async ({ browser }) => {
    admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await signIn(admin, "admin");
  });
  test.afterAll(async () => admin.close());

  const row = (name: string) => admin.getByTestId("school-teachers").locator("tr", { hasText: name });
  const openTeachersTab = async () => {
    await admin.goto(`/admin/schools/${schoolId}`);
    await admin.getByRole("tab", { name: "Teachers" }).click();
  };

  test("the Teachers tab shows the primary teacher and a badge per current teacher", async () => {
    await openTeachersTab();
    await expect(admin.getByTestId("school-primary-teacher")).toContainText(`Primary teacher: ${first.firstName} ${first.lastName}`);
    await expect(row(first.firstName).getByTestId("teacher-role-badge")).toHaveText("Primary");
    await expect(row("@e2e.teacher").getByTestId("teacher-role-badge")).toHaveText("Secondary");
    // Only a secondary teacher can be made primary.
    await expect(row(first.firstName).getByRole("button", { name: "Make primary" })).toHaveCount(0);
  });

  test("the Administrator makes the secondary teacher primary (confirmed): the previous primary becomes secondary", async () => {
    await row("@e2e.teacher").getByRole("button", { name: "Make primary" }).click();
    const dialog = admin.getByRole("dialog");
    await expect(dialog).toContainText("Change the primary teacher?");
    await expect(dialog).toContainText(`${first.firstName} ${first.lastName} becomes a secondary teacher.`);
    await expect(dialog).toContainText("Permissions do not change");
    await dialog.getByRole("button", { name: "Make primary" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row("@e2e.teacher").getByTestId("teacher-role-badge")).toHaveText("Primary");
    await expect(row(first.firstName).getByTestId("teacher-role-badge")).toHaveText("Secondary");
    await expect(admin.getByTestId("school-primary-teacher")).not.toContainText(first.firstName);
    const roles = await withDb(async (c) => (await c.query<{ teacherId: string; role: string }>(
      `SELECT "teacherId", role::text FROM "TeacherSchoolAssignment" WHERE "schoolId" = $1 AND "isActive" ORDER BY "createdAt"`, [schoolId],
    )).rows);
    expect(roles).toEqual([{ teacherId: firstId, role: "SECONDARY" }, { teacherId, role: "PRIMARY" }]);
    const audit = await withDb(async (c) => (await c.query(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'TEACHER_PRIMARY_ASSIGNED' AND metadata->>'schoolId' = $1`, [schoolId])).rows[0].n);
    expect(audit).toBe(1);
  });

  test("the badge on the teacher's admin page and in the Users list", async () => {
    await admin.goto(`/admin/users/${teacherId}`);
    await expect(admin.getByTestId("teacher-schools").locator("li", { hasText: school }).getByTestId("teacher-role-badge")).toHaveText("Primary");
    await admin.goto(`/admin/users?role=TEACHER&q=${first.username}`);
    const listRow = admin.locator("tr", { hasText: first.username });
    await expect(listRow.getByTestId("teacher-role-badge")).toHaveText("Secondary");
    // The School column shows the teacher's school (a teacher's school is their school link, owner 2026-11-22).
    await expect(listRow).toContainText(school);
  });

  test("the teacher sees their role on their own profile", async ({ browser }) => {
    const teacher = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await signIn(teacher, "teacher");
    await teacher.goto("/teacher/profile");
    const mine = teacher.getByTestId("teacher-own-schools");
    await expect(mine.locator("li", { hasText: school }).getByTestId("teacher-role-badge")).toHaveText("Primary");
    await teacher.close();
  });

  test("ending the primary's school assignment leaves the school without a primary teacher; nobody is promoted", async () => {
    await admin.goto(`/admin/users/${teacherId}`);
    await admin.getByTestId("teacher-schools").locator("li", { hasText: school }).getByRole("button", { name: "End" }).click();
    await expect(admin.getByTestId("teacher-schools").locator("li", { hasText: school })).toHaveCount(0);
    await openTeachersTab();
    await expect(admin.getByTestId("school-primary-teacher")).toContainText("No primary teacher");
    await expect(row(first.firstName).getByTestId("teacher-role-badge")).toHaveText("Secondary");
  });
});
