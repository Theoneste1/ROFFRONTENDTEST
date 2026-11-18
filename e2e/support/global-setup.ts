/**
 * Creates the synthetic accounts of every role in the disposable test database (idempotent): Super Admin, Coach,
 * Head Coach, Teacher and Student, all activated, with one known password. The seeded administrator already exists.
 * Refuses any database whose host is not local — this must never touch a real database.
 */
import pg from "pg";
import { ACCOUNTS, PASSWORD } from "./accounts";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set (the disposable test database).");
  const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) throw new Error(`Refusing E2E_DATABASE_URL on host ${host}: browser tests use a local disposable database only.`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // bcryptjs hashes are verified by the backend's bcrypt (same format).
    const { hashSync } = await import("bcryptjs");
    const hash = hashSync(PASSWORD, 10);
    const junior = (await client.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR' LIMIT 1`)).rows[0]?.id ?? null;
    for (const a of Object.values(ACCOUNTS)) {
      if (a.username === "admin") continue;
      await client.query(
        `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt",
                             "gradeLevel", "divisionId", "homeLocation", "dateOfBirth")
         VALUES (gen_random_uuid()::text, $1, $2, 'E2E', $3, $4::"Role", $5, now(), true, now(), $6::"GradeLevel", $7, $8, $9)
         ON CONFLICT (username) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role, "accountStatus" = 'ACTIVE',
           "dateOfBirth" = EXCLUDED."dateOfBirth"`,   // every run starts from the fixture date (a run may correct it)
        [
          a.username, a.username.replace("e2e.", "").replace(/^./, (c) => c.toUpperCase()), `${a.username}@e2e.local`, a.role, hash,
          a.role === "STUDENT" ? "S2" : null, a.role === "STUDENT" ? junior : null, a.role === "STUDENT" ? "Huye" : null,
          a.role === "STUDENT" ? "2012-05-01" : null,
        ],
      );
    }
  } finally {
    await client.end();
  }
}
