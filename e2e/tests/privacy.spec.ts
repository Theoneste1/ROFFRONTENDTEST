/**
 * Privacy rules decided by the owner on 2026-11-18, in the real frontend against the real backend.
 *
 * 1. Coach applications: every attempt is its own application. A rejected applicant's private question and answer stay
 *    on that application; an applicant who re-uses the username never sees them, and neither does the Administrator's
 *    expanded view of the NEW application (Coaches page → applications panel → "Details", fed by GET /mentor-requests;
 *    there is no separate detail endpoint).
 * 2. Student profile pictures: only the student, Administrators and teachers who may view the profile. A direct URL is
 *    refused without a token (the API never authenticates by cookie) and refused to a classmate's token.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";
import { PASSWORD } from "../support/accounts";
import { idOf, withDb } from "../support/db";
import { signIn } from "../support/session";

const tag = Date.now().toString(36);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** Sign in through the API (waits out the 10-a-minute sign-in limit, never weakened). */
async function apiToken(request: APIRequestContext, username: string, password: string) {
  for (let i = 0; i < 3; i++) {
    const r = await request.post("/api/v1/auth/login", { data: { username, password } });
    if (r.status() === 429) {
      test.info().setTimeout(test.info().timeout + 65_000);
      await new Promise((res) => setTimeout(res, 61_000));
      continue;
    }
    expect(r.status()).toBe(200);
    return (await r.json()).access_token as string;
  }
  throw new Error("sign-in kept being rate-limited");
}

test.describe.serial("Coach applications: each attempt keeps its own questions and answers", () => {
  const username = `e2e.coachapp.${tag}`;
  let firstId = "";
  let secondId = "";

  test.beforeAll(async ({ request }) => {
    const first = await request.post("/api/v1/mentor-requests", {
      data: { firstName: "Vera", lastName: "First", username, email: `${username}@e2e.local`, password: "Mentor123", olympiadInterests: ["MATHEMATICS"] },
    });
    expect(first.status()).toBe(201);
    firstId = (await first.json()).id;
    // The Administrator asked a private question and the first applicant answered; then the application was rejected.
    await withDb(async (c) => {
      const admin = await idOf(c, "admin");
      await c.query(
        `INSERT INTO "ApplicationInfoRequest" (id, "mentorRequestId", question, answer, "answeredAt", "requestedById", "requestedAt", "tokenHash", "expiresAt")
         VALUES (gen_random_uuid()::text, $1, 'What is your home address? (private)', 'House 12 KG 5 Ave (private answer)', now(), $2, now(), $3, now() + interval '1 day')`,
        [firstId, admin, randomBytes(32).toString("hex")],
      );
      await c.query(`UPDATE "MentorRequest" SET status = 'REJECTED', "passwordHash" = NULL WHERE id = $1`, [firstId]);
    });
    // Someone else applies with the same username.
    const second = await request.post("/api/v1/mentor-requests", {
      data: { firstName: "Nora", lastName: "Second", username, email: `other.${username}@e2e.local`, password: "Mentor123", olympiadInterests: ["MATHEMATICS"] },
    });
    expect(second.status()).toBe(201);
    const body = await second.json();
    secondId = body.id;
    expect(secondId).not.toBe(firstId);
    expect(JSON.stringify(body)).not.toContain("private");
  });

  test("the Administrator's expanded view of the new application shows no earlier question or answer", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/mentors");
    await page.getByRole("tab", { name: /^Applications/ }).click();
    const row = page.locator("tr", { hasText: `other.${username}@e2e.local` });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Details" }).click();
    await expect(row).not.toContainText("home address");
    await expect(row).not.toContainText("private answer");
    // The original, rejected application still shows its own question and answer.
    await page.getByRole("group", { name: "Application status" }).getByRole("button", { name: "Rejected" }).click();
    const original = page.locator("tr", { hasText: `${username}@e2e.local` }).filter({ hasText: "Vera" });
    await expect(original).toBeVisible({ timeout: 30_000 });
    await original.getByRole("button", { name: "Details" }).click();
    await expect(original).toContainText("What is your home address? (private)");
    await expect(original).toContainText("House 12 KG 5 Ave (private answer)");
  });
});

test.describe.serial("Student profile pictures: no access just for being signed in", () => {
  const classmate = `e2e.classmate.${tag}`;
  let studentId = "";

  test.beforeAll(async ({ request }) => {
    await withDb(async (c) => {
      studentId = await idOf(c, "e2e.student");
      const junior = (await c.query(`SELECT id FROM "Division" WHERE code = 'JUNIOR' LIMIT 1`)).rows[0]?.id ?? null;
      await c.query(
        `INSERT INTO "User" (id, username, "firstName", "lastName", email, role, "passwordHash", "activatedAt", "isApproved", "updatedAt", "gradeLevel", "divisionId", "homeLocation", "dateOfBirth")
         VALUES (gen_random_uuid()::text, $1, 'Clara', 'Mate', $2, 'STUDENT', $3, now(), true, now(), 'S2', $4, 'Huye', '2012-05-01')`,
        [classmate, `${classmate}@e2e.local`, hashSync(PASSWORD, 4), junior],
      );
    });
    const token = await apiToken(request, "e2e.student", PASSWORD);
    const up = await request.put("/api/v1/me/avatar", {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: { name: "me.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(up.status()).toBe(200);
  });

  test("direct URL: signed out 401; in a classmate's signed-in browser still 401 (no cookie access); with a classmate's token 404", async ({ page, request }) => {
    const url = `/api/v1/users/${studentId}/avatar`;
    expect((await request.get(url)).status()).toBe(401);
    // Signed in as a classmate, then opening the picture URL directly in the browser.
    await page.goto("/login");
    await page.locator('input[name="username"]').fill(classmate);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 90_000 });
    const direct = await page.goto(url);
    expect(direct?.status()).toBe(401);
    // With the classmate's own access token: the same answer as "no picture".
    const token = await apiToken(request, classmate, PASSWORD);
    expect((await request.get(url, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404);
  });

  test("the student and an Administrator get the picture, never cached", async ({ request }) => {
    for (const [user, password] of [["e2e.student", PASSWORD], ["admin", process.env.E2E_ADMIN_PASSWORD ?? "E2e-Admin-2026!"]] as const) {
      const token = await apiToken(request, user, password);
      const r = await request.get(`/api/v1/users/${studentId}/avatar`, { headers: { Authorization: `Bearer ${token}` } });
      expect([user, r.status()]).toEqual([user, 200]);
      expect(r.headers()["cache-control"]).toBe("private, no-store");
    }
  });
});
