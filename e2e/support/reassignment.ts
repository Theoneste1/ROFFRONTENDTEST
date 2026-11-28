/**
 * Fixtures for "Reassign submission" (owner 2026-11-28): the Physics and Computing subjects when missing, published tests
 * created through the API (the server's times), and a synthetic student's typed answers submitted through the API.
 * Synthetic data only, in the disposable test database.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { withDb } from "./db";

export async function apiToken(request: APIRequestContext, username: string, password: string) {
  for (let i = 0; i < 3; i++) {
    const r = await request.post("/api/v1/auth/login", { data: { username, password } });
    if (r.status() === 429) {
      test.info().setTimeout(test.info().timeout + 65_000);
      await new Promise((res) => setTimeout(res, 61_000));
      continue;
    }
    expect(r.status()).toBe(200);
    return { Authorization: `Bearer ${(await r.json()).access_token as string}` };
  }
  throw new Error("sign-in kept being rate-limited");
}

/** Physics and Computing (Olympiad subjects) exist as test subjects; returns { CODE: id }. */
export async function ensureSubjects(request: APIRequestContext, auth: Record<string, string>) {
  await withDb(async (c) => {
    for (const [code, name, order] of [["PHYSICS", "Physics", 2], ["COMPUTING", "Computing", 3]] as const) {
      await c.query(
        `INSERT INTO "Discipline" (id, code, name, "isActive", "sortOrder", "updatedAt") VALUES (gen_random_uuid()::text, $1, $2, true, $3, now())
         ON CONFLICT (code) DO NOTHING`, [code, name, order],
      );
    }
  });
  const subjects = (await (await request.get("/api/v1/admin/tests/subjects", { headers: auth })).json()) as Array<{ id: string; code: string }>;
  return Object.fromEntries(subjects.map((s) => [s.code, s.id])) as Record<string, string>;
}

/** A published test open for two hours (typed answers or pages). */
export async function publishedTest(request: APIRequestContext, auth: Record<string, string>, title: string, subjectId: string, division: string) {
  const created = await request.post("/api/v1/admin/tests", {
    headers: auth,
    data: {
      title, subjectId, division, answerFormat: "BOTH", maxMarks: 10,
      opensAt: new Date(Date.now() - 3_600_000).toISOString(), closesAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      questions: [{ prompt: "Explain your answer.", maxMarks: 10 }],
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as string;
  expect((await request.post(`/api/v1/admin/tests/${id}/publish`, { headers: auth })).status()).toBe(200);
  return id;
}

/** The student's typed answer to a test; returns the submission's id. */
export async function submitTyped(request: APIRequestContext, studentAuth: Record<string, string>, testId: string, text: string) {
  const r = await request.post(`/api/v1/me/tests/${testId}/submission`, { headers: studentAuth, data: { clientKey: crypto.randomUUID(), typedAnswer: text } });
  expect(r.status()).toBe(201);
  return withDb(async (c) => (await c.query<{ id: string }>(
    `SELECT id FROM "TestSubmission" WHERE "testId" = $1 ORDER BY "firstSubmittedAt" DESC LIMIT 1`, [testId],
  )).rows[0].id);
}
