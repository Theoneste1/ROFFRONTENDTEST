/**
 * Activate now (owner 2026-11-24) in the browser:
 *  - an Administrator opens the page of a student "Awaiting setup" (signed up, e-mail never confirmed), clicks Activate
 *    now, confirms; the success notice shows, and the student then signs in;
 *  - an invited person without a password is not offered the button (Resend invitation is);
 *  - from the Users list, two accounts awaiting setup are activated with the bulk action "Activate now (skip e-mail
 *    confirmation)"; the preview says both will be activated; both then sign in.
 * Synthetic students are created per run (unique names); nothing else is modified.
 */
import { expect, test } from "@playwright/test";
import { createSchool, createStudent, idOf, withDb } from "../support/db";
import { PASSWORD } from "../support/accounts";
import { signIn, signInWith } from "../support/session";

const RUN = Date.now().toString(36);
const ONE = { username: `actnow.one.${RUN}`, first: `ActOne${RUN}` };
const INVITED = { username: `actnow.inv.${RUN}`, first: `ActInv${RUN}` };
const A = { username: `actnow.a.${RUN}`, first: `ActA${RUN}` };
const B = { username: `actnow.b.${RUN}`, first: `ActB${RUN}` };

/** A self-registered student who never confirmed their e-mail: activatedAt null, their own password kept. */
async function awaitingSetup(username: string, first: string, school: string, opts: { password?: boolean } = {}) {
  return withDb(async (c) => {
    const id = await createStudent(c, username, first, school, "VERIFIED");
    await c.query(`UPDATE "User" SET "activatedAt" = NULL${opts.password === false ? `, "passwordHash" = NULL` : ""} WHERE id = $1`, [id]);
    return id;
  });
}

const activatedAt = (username: string) =>
  withDb(async (c) => (await c.query(`SELECT "activatedAt" FROM "User" WHERE username = $1`, [username])).rows[0].activatedAt as Date | null);

test.describe("activate now", () => {
  let oneId = "";
  let invitedId = "";

  test.beforeAll(async () => {
    const school = await withDb((c) => createSchool(c, `Activate Now School ${RUN}`));
    oneId = await awaitingSetup(ONE.username, ONE.first, school);
    invitedId = await awaitingSetup(INVITED.username, INVITED.first, school, { password: false });
    await awaitingSetup(A.username, A.first, school);
    await awaitingSetup(B.username, B.first, school);
  });

  test("an Administrator activates a student awaiting setup from their page; the student then signs in", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await page.goto(`/admin/users/${oneId}`);
    const button = page.getByTestId("activate-now");
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`${ONE.first} E2E will be able to sign in at once, without confirming their e-mail.`);
    await dialog.getByRole("button", { name: "Activate now" }).click();
    await expect(page.getByText(`${ONE.first} E2E's account is active. They can sign in now.`)).toBeVisible({ timeout: 30_000 });
    expect(await activatedAt(ONE.username)).not.toBeNull();
    // The button is gone once the account is active.
    await expect(page.getByTestId("activate-now")).toHaveCount(0);
    const audits = await withDb(async (c) => (await c.query(
      `SELECT "actorId", metadata->>'via' AS via FROM "AuditLog" WHERE action = 'ACTIVATE_ACCOUNT' AND "entityId" = $1`, [oneId])).rows);
    expect(audits).toEqual([{ actorId: await withDb((c) => idOf(c, "admin")), via: "admin" }]);

    // The student signs in (a separate browser context: the Administrator's session is untouched).
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await signInWith(student, ONE.username, PASSWORD);
    await expect(student).toHaveURL(/\/student\//, { timeout: 30_000 });
    await studentContext.close();
  });

  test("an invited person without a password is not offered Activate now (Resend invitation is)", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto(`/admin/users/${invitedId}`);
    await expect(page.getByRole("button", { name: "Resend invitation" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("activate-now")).toHaveCount(0);
  });

  test("bulk: two accounts awaiting setup activated from the Users list; both then sign in", async ({ page, browser }) => {
    test.setTimeout(240_000);
    await signIn(page, "admin");
    await page.goto(`/admin/users?q=${RUN}`);
    await expect(page.getByLabel(`Select ${A.first} E2E`)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(`Select ${A.first} E2E`).check();
    await page.getByLabel(`Select ${B.first} E2E`).check();
    await page.getByRole("button", { name: "Act on 2 selected" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#bulk-action").selectOption({ label: "Activate now (skip e-mail confirmation)" });
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByTestId("bulk-preview")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByTestId("bulk-will-apply")).toHaveText("2 accounts will be activated now.");
    await dialog.getByRole("checkbox").last().check();
    await dialog.getByRole("button", { name: "Apply to 2 accounts" }).click();

    await expect.poll(async () => [await activatedAt(A.username), await activatedAt(B.username)].every((d) => d !== null), { timeout: 60_000 }).toBe(true);
    const op = await withDb(async (c) => (await c.query(
      `SELECT id, action, total FROM "BulkOperation" WHERE action = 'activateNow' ORDER BY "createdAt" DESC LIMIT 1`)).rows[0]);
    expect(op).toMatchObject({ action: "activateNow", total: 2 });
    const audited = await withDb(async (c) => (await c.query(
      `SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'ACTIVATE_ACCOUNT' AND metadata->>'operationId' = $1`, [op.id])).rows[0].n);
    expect(audited).toBe(2);

    for (const who of [A, B]) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await signInWith(p, who.username, PASSWORD);
      await expect(p).toHaveURL(/\/student\//, { timeout: 30_000 });
      await ctx.close();
    }
  });
});
