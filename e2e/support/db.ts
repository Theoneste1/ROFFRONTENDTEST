/**
 * Direct access to the disposable test database for fixtures a spec needs (a school, verified or pending school
 * claims, a teacher's school). Same guard as global-setup: a non-local host is refused.
 */
import pg from "pg";
import { hashSync } from "bcryptjs";
import { PASSWORD } from "./accounts";

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set (the disposable test database).");
  const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Refusing E2E_DATABASE_URL on host ${host}.`);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export const idOf = async (c: pg.Client, username: string) =>
  (await c.query<{ id: string }>(`SELECT id FROM "User" WHERE username = $1`, [username])).rows[0].id;

export async function createSchool(c: pg.Client, name: string) {
  return (await c.query<{ id: string }>(
    `INSERT INTO "School" (id, name, location) VALUES (gen_random_uuid()::text, $1, 'Huye') RETURNING id`, [name],
  )).rows[0].id;
}

/** A Student of `schoolId` with a current claim in `status` (VERIFIED decided by the administrator). */
export async function createStudent(c: pg.Client, username: string, firstName: string, schoolId: string, status: "VERIFIED" | "PENDING") {
  const junior = (await c.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR' LIMIT 1`)).rows[0]?.id ?? null;
  const id = (await c.query<{ id: string }>(
    `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt",
                         "gradeLevel", "divisionId", "homeLocation", "dateOfBirth", "schoolId")
     VALUES (gen_random_uuid()::text, $1, $2, 'E2E', $3, 'STUDENT', $4, now(), true, now(), 'S2', $5, 'Huye', '2012-05-01', $6) RETURNING id`,
    [username, firstName, `${username}@e2e.local`, hashSync(PASSWORD, 4), junior, schoolId],
  )).rows[0].id;
  await claim(c, id, schoolId, status);
  return id;
}

export async function claim(c: pg.Client, studentId: string, schoolId: string, status: "VERIFIED" | "PENDING") {
  const admin = await idOf(c, "admin");
  await c.query(`UPDATE "User" SET "schoolId" = $2 WHERE id = $1`, [studentId, schoolId]);
  await c.query(
    `INSERT INTO "StudentSchoolAffiliation" (id, "studentId", "schoolId", status, source, "createdById", "decidedById", "decidedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3::"SchoolAffiliationStatus", $4::"SchoolAffiliationSource", $5, $6, $7)`,
    [studentId, schoolId, status, status === "VERIFIED" ? "ADMIN" : "REGISTRATION", admin, status === "VERIFIED" ? admin : null, status === "VERIFIED" ? new Date() : null],
  );
}

export async function assignTeacherSchool(c: pg.Client, teacherId: string, schoolId: string) {
  const admin = await idOf(c, "admin");
  await c.query(
    `INSERT INTO "TeacherSchoolAssignment" (id, "teacherId", "schoolId", "assignedById") VALUES (gen_random_uuid()::text, $1, $2, $3)
     ON CONFLICT ("teacherId", "schoolId") DO UPDATE SET "isActive" = true, "endedAt" = NULL`,
    [teacherId, schoolId, admin],
  );
}

/** The session a sign-in just created for this person (its refresh-token family: the newest one). */
export const newestSession = (username: string) => withDb(async (c) => (await c.query<{ f: string }>(
  `SELECT r."familyId" AS f FROM "RefreshToken" r JOIN "User" u ON u.id = r."userId"
    WHERE u.username = $1 ORDER BY r."createdAt" DESC LIMIT 1`, [username])).rows[0].f);

/** Whether the server would still accept that session (a current, not revoked, not expired refresh token of the family). */
export const sessionLive = (familyId: string) => withDb(async (c) => Number((await c.query<{ n: string }>(
  `SELECT count(*) AS n FROM "RefreshToken" WHERE "familyId" = $1 AND "revokedAt" IS NULL AND "rotatedAt" IS NULL AND "expiresAt" > now()`,
  [familyId])).rows[0].n) > 0);
