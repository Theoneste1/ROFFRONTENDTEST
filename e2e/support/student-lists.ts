/**
 * Fixtures for the student-list checks (owner 2026-11-27: pictures beside names, the username in its own column):
 * a school with the e2e Teacher, a Coach of the Mathematics programme, and `count` verified students of that school and
 * programme, enrolled in the current year (the Administrators' Students list shows the current year's students).
 * The first student gets a picture through the Administrators' API (PUT /admin/users/:id/avatar); the others have none.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashSync } from "bcryptjs";
import { request } from "@playwright/test";
import { PASSWORD, passwordOf } from "./accounts";
import { assignTeacherSchool, createSchool, createStudent, idOf, withDb } from "./db";

export type StudentListFixture = { run: string; coachUser: string; schoolId: string; students: { id: string; username: string; firstName: string }[] };

export async function createStudentListFixture(prefix: string, count: number): Promise<StudentListFixture> {
  const run = `${prefix}${Date.now().toString(36)}`;
  const coachUser = `e2e.slc.${run}`;
  const students: StudentListFixture["students"] = [];
  let schoolId = "";
  await withDb(async (c) => {
    const maths = (await c.query(`SELECT id FROM "Discipline" WHERE code = 'MATHEMATICS'`)).rows[0].id;
    const coach = (await c.query<{ id: string }>(
      `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt", gender)
       VALUES (gen_random_uuid()::text, $1, 'Listcoach', $2, $3, 'MENTOR'::"Role", $4, now(), true, now(), 'FEMALE') RETURNING id`,
      [coachUser, run, `${coachUser}@e2e.local`, hashSync(PASSWORD, 4)],
    )).rows[0].id;
    const school = await createSchool(c, `E2E List School ${run}`);
    schoolId = school;
    await assignTeacherSchool(c, await idOf(c, "e2e.teacher"), school);
    for (let i = 1; i <= count; i++) {
      const username = `e2e.sl.${run}.${String(i).padStart(2, "0")}`;
      const firstName = `Lista${run}${String(i).padStart(2, "0")}`;
      const id = await createStudent(c, username, firstName, school, "VERIFIED");
      await c.query(`UPDATE "User" SET "gradeLevel" = 'S2' WHERE id = $1`, [id]);
      await c.query(
        `INSERT INTO "StudentEnrollment" (id, "studentId", "academicYearId", "divisionId", "gradeLevel", "schoolId")
         SELECT gen_random_uuid()::text, u.id, y.id, u."divisionId", 'S2', $2 FROM "User" u, "AcademicYear" y
          WHERE u.id = $1 AND y."isCurrent" = true AND u."divisionId" IS NOT NULL`, [id, school],
      );
      students.push({ id, username, firstName });
    }
    for (const userId of [coach, ...students.map((s) => s.id)]) {
      await c.query(
        `INSERT INTO "ProgrammeMembership" (id, "userId", "disciplineId", source) VALUES (gen_random_uuid()::text, $1, $2, 'MANUAL')
         ON CONFLICT ("userId", "disciplineId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`, [userId, maths],
      );
    }
  });
  // The first student's picture, set the way an Administrator does.
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL ?? "http://127.0.0.1:4100" });
  try {
    const login = await api.post("/api/v1/auth/login", { data: { username: "admin", password: passwordOf("admin") } });
    if (!login.ok()) throw new Error(`admin sign-in failed: ${login.status()}`);
    const token = (await login.json()).access_token as string;
    const png = readFileSync(join(process.cwd(), "public", "icon-192.png"));
    const r = await api.put(`/api/v1/admin/users/${students[0].id}/avatar`, {
      headers: { authorization: `Bearer ${token}` },
      multipart: { file: { name: "face.png", mimeType: "image/png", buffer: png } },
    });
    if (!r.ok()) throw new Error(`picture upload failed: ${r.status()} ${await r.text()}`);
  } finally {
    await api.dispose();
  }
  return { run, coachUser, schoolId, students };
}

/**
 * After the checks: the e2e Teacher leaves the fixture's school and its students leave the programme, so the other
 * browser tests (which share the e2e Teacher and the Mathematics programme) see the same lists as without this fixture.
 */
export async function endStudentListFixture(f: StudentListFixture | undefined): Promise<void> {
  if (!f) return;
  await withDb(async (c) => {
    await c.query(`UPDATE "TeacherSchoolAssignment" SET "isActive" = false, "endedAt" = now() WHERE "schoolId" = $1 AND "isActive" = true`, [f.schoolId]);
    await c.query(`UPDATE "ProgrammeMembership" SET "isActive" = false, "endedAt" = now() WHERE "userId" = ANY($1::text[]) AND "isActive" = true`, [f.students.map((s) => s.id)]);
  });
}
