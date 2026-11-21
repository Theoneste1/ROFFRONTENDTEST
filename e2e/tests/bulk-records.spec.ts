/**
 * Bulk actions on records other than accounts (capability bulkOperationsGeneric; owner, 2026-11-20 "activate many
 * schools at once"):
 *  - an Administrator ticks two schools and deactivates them (preview, reason, acknowledgement), then activates every
 *    school matching the search; both change, and the operation page shows the result of each school;
 *  - an Administrator ticks two coach applications and rejects them together; both are rejected;
 *  - an Administrator publishes every assignment waiting for approval that matches a search (backends with the
 *    ASSIGNMENT record type; skipped otherwise).
 * Synthetic schools and applications only (unique per run); nothing else is modified.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSchool, withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const SCHOOLS = [`Bulk Lycée A ${RUN}`, `Bulk Lycée B ${RUN}`];
const COACHES = [{ first: `BulkCoachA${RUN}`, username: `bulk.coach.a.${RUN}` }, { first: `BulkCoachB${RUN}`, username: `bulk.coach.b.${RUN}` }];

const ASSIGNMENTS = [`Bulk week ${RUN} A`, `Bulk week ${RUN} B`];

const schoolStates = () => withDb(async (c) => (await c.query(
  `SELECT "isActive" FROM "School" WHERE name = ANY($1) ORDER BY name`, [SCHOOLS])).rows.map((r) => r.isActive as boolean));

/** Choose the action, preview, give the reason, acknowledge and apply; returns the preview's dialog. */
async function runBulk(page: Page, action: string, reason: string, apply: string): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#bulk-record-action").selectOption(action);
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByTestId("bulk-preview")).toBeVisible({ timeout: 30_000 });
  await dialog.locator("#bulk-record-reason").fill(reason);
  await dialog.getByTestId("bulk-acknowledge").check();
  await dialog.getByRole("button", { name: apply }).click();
  await expect(page.getByTestId("bulk-started")).toBeVisible({ timeout: 30_000 });
  return dialog;
}

test.describe("bulk actions on schools and applications", () => {
  test.beforeAll(async () => {
    await withDb(async (c) => {
      for (const name of SCHOOLS) await createSchool(c, name);
      const ref = (await c.query(
        `SELECT (SELECT id FROM "Course" ORDER BY "sortOrder", id LIMIT 1) AS course, (SELECT id FROM "Division" WHERE code = 'JUNIOR') AS division,
                (SELECT id FROM "AcademicYear" ORDER BY "isCurrent" DESC NULLS LAST, "startsOn" DESC LIMIT 1) AS year, (SELECT id FROM "User" WHERE username = 'admin') AS admin`)).rows[0];
      for (const title of ASSIGNMENTS) {
        await c.query(
          `INSERT INTO "Assignment" (id, title, instructions, deadline, points, "maximumMarks", status, "courseId", "divisionId", "academicYearId", "createdById", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, 'Solve the problems.', now() + interval '30 days', 10, 10, 'PENDING_APPROVAL', $2, $3, $4, $5, now())`,
          [title, ref.course, ref.division, ref.year, ref.admin],
        );
      }
      for (const coach of COACHES) {
        await c.query(
          `INSERT INTO "MentorRequest" (id, "firstName", "lastName", username, email, status, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, 'E2E', $2, $3, 'PENDING', now())`,
          [coach.first, coach.username, `${coach.username}@e2e.local`],
        );
      }
    });
  });

  test("deactivate two ticked schools, then activate every school matching the search", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto(`/admin/schools?q=${encodeURIComponent(RUN)}`);
    const toolbar = page.getByTestId("bulk-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 30_000 });
    for (const name of SCHOOLS) await page.getByLabel(`Select ${name}`).check();
    await toolbar.getByRole("button", { name: "Act on 2 selected" }).click();
    // A required reason: Apply stays disabled until it is given.
    const dialog = page.getByRole("dialog");
    await dialog.locator("#bulk-record-action").selectOption("deactivate");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByTestId("bulk-preview-total")).toContainText("2 schools");
    await expect(dialog.getByTestId("bulk-preview-sample")).toContainText(SCHOOLS[0]);
    await dialog.getByTestId("bulk-acknowledge").check();
    await expect(dialog.getByTestId("bulk-apply")).toBeDisabled();
    await expect(dialog.getByText("Give a reason (3–500 characters).")).toBeVisible();
    await dialog.getByRole("button", { name: "Back" }).click();
    await runBulk(page, "deactivate", "Bulk test: closed for the holidays.", "Deactivate 2 schools");
    await expect.poll(schoolStates, { timeout: 60_000 }).toEqual([false, false]);

    // Every school matching the search (no ticks): activate.
    await page.reload();
    await expect(toolbar).toBeVisible({ timeout: 30_000 });
    await toolbar.getByRole("button", { name: "Act on all 2 matching" }).click();
    await expect(page.getByRole("dialog")).toContainText("every school matching the current filters");
    await runBulk(page, "activate", "Bulk test: open again.", "Activate 2 schools");
    await expect.poll(schoolStates, { timeout: 60_000 }).toEqual([true, true]);

    // The operation page: the result of each school.
    await page.getByRole("link", { name: "See progress and results" }).click();
    const detail = page.getByTestId("bulk-operation-detail").first();
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail.getByTestId("bulk-operation-item")).toHaveCount(2, { timeout: 60_000 });
    await expect(detail).toContainText(SCHOOLS[0]);
    await expect(page.getByTestId("bulk-record-operation").first()).toContainText("2 done · 0 failed · 0 skipped / 2");
  });

  test("reject two ticked coach applications together", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto("/admin/mentors?tab=applications");
    await expect(page.getByTestId("bulk-toolbar")).toBeVisible({ timeout: 30_000 });
    for (const coach of COACHES) await page.getByLabel(`Select ${coach.first} E2E`).check();
    await page.getByTestId("bulk-toolbar").getByRole("button", { name: "Act on 2 selected" }).click();
    await runBulk(page, "reject", "Bulk test: the programme is full this term.", "Reject 2 coach applications");
    await expect.poll(async () => withDb(async (c) => (await c.query(
      `SELECT status::text AS s, "rejectionReason" AS r FROM "MentorRequest" WHERE username = ANY($1) ORDER BY username`,
      [COACHES.map((x) => x.username)])).rows), { timeout: 60_000 })
      .toEqual([
        { s: "REJECTED", r: "Bulk test: the programme is full this term." },
        { s: "REJECTED", r: "Bulk test: the programme is full this term." },
      ]);
  });

  test("publish every assignment waiting for approval that matches a search", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto(`/admin/assignments?status=PENDING_APPROVAL&q=${encodeURIComponent(RUN)}`);
    const toolbar = page.getByTestId("bulk-toolbar");
    await expect(page.getByText(ASSIGNMENTS[0]).first()).toBeVisible({ timeout: 30_000 });
    test.skip(!(await toolbar.isVisible()), "the backend has no ASSIGNMENT bulk actions");
    await toolbar.getByRole("button", { name: "Act on all 2 matching" }).click();
    await runBulk(page, "publish", "Bulk test: approved together.", "Publish 2 assignments");
    await expect.poll(async () => withDb(async (c) => (await c.query(
      `SELECT status::text AS s FROM "Assignment" WHERE title = ANY($1) ORDER BY title`, [ASSIGNMENTS])).rows.map((r) => r.s)), { timeout: 60_000 })
      .toEqual(["PUBLISHED", "PUBLISHED"]);
  });
});
