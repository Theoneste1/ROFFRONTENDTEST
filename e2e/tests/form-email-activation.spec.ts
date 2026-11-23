/**
 * E-mail activation per sign-up form (owner 2026-11-23), in a real browser against the real backend and PostgreSQL:
 * off on every sign-up form by default (none on the contact form); an administrator turns it on for the student form
 * on the Forms page — a new student must then activate; turned off again, the next student is active at once.
 * Synthetic data only; usernames are unique per run. Leaves every form as it found it (off).
 */
import { expect, request, test } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4100";

async function registerStudent(n: number) {
  const api = await request.newContext({ baseURL: API });
  try {
    const username = `act.${RUN}.${n}`;
    const r = await api.post("/api/v1/auth/register/student", {
      data: {
        firstName: "Aline", lastName: `Act${RUN}`, username, email: `${username}@e2e.local`, password: "Sign-Up-Pass-2026!",
        dateOfBirth: "2010-05-01", gender: "FEMALE", homeCountry: "UG", guardianPhone: "0722000111", gradeLevel: "S4",
        schoolName: "Some School", schoolLocation: "Kigali", homeLocation: "Kigali",
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const activatedAt = await withDb(async (c) => (await c.query(`SELECT "activatedAt" FROM "User" WHERE username = $1`, [username])).rows[0].activatedAt);
    return { body: await r.json(), activatedAt };
  } finally {
    await api.dispose();
  }
}

test("off by default; turned on for the student form a new student must activate; turned off, the next one is active at once", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/forms");
  for (const key of ["STUDENT_REGISTRATION", "TEACHER_REGISTRATION", "COACH_APPLICATION"]) {
    await expect(page.getByTestId(`activation-${key}`)).toContainText("Not required: people who sign up can sign in at once.");
  }
  await expect(page.getByTestId("activation-CONTACT")).toHaveCount(0);
  const before = await registerStudent(1);
  expect(before.body.requiresEmailVerification).toBe(false);
  expect(before.activatedAt).not.toBeNull();

  await page.getByTestId("activation-toggle-STUDENT_REGISTRATION").click();
  await expect(page.getByText("Student registration: e-mail activation is now required for new sign-ups.")).toBeVisible();
  await expect(page.getByTestId("activation-STUDENT_REGISTRATION")).toContainText("Required:");
  await expect(page.getByTestId("activation-COACH_APPLICATION")).toContainText("Not required");
  // The backend caches form settings for up to 30 seconds per process; the change itself clears that cache.
  const during = await registerStudent(2);
  expect(during.body.requiresEmailVerification).toBe(true);
  expect(during.activatedAt).toBeNull();

  await page.getByTestId("activation-toggle-STUDENT_REGISTRATION").click();
  await expect(page.getByText(/e-mail activation is no longer required/)).toBeVisible();
  await expect(page.getByTestId("activation-STUDENT_REGISTRATION")).toContainText("Not required");
  const after = await registerStudent(3);
  expect(after.body.requiresEmailVerification).toBe(false);
  expect(after.activatedAt).not.toBeNull();
});
