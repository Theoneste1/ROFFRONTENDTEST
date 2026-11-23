/**
 * ROF news subscribers in the browser (owner 2026-11-23; capability `subscribers`):
 *  - a visitor subscribes from the home page's "Get ROF news" box;
 *  - an Administrator finds them on the Subscribers screen;
 *  - the visitor opens the unsubscribe link from their welcome e-mail and unsubscribes; the Administrator sees it;
 *  - an Administrator composes an update for an audience, sees the number of recipients, sends it (queued for exactly the
 *    ACTIVE subscribers of the audience) and cancels it before anything goes out.
 * Each result is checked in the database. Synthetic data only; the address is unique per run.
 *
 * The welcome e-mail is held in the outbox while the spec reads its unsubscribe link (a temporary trigger in the disposable
 * test database delays subscriber e-mails; it is removed at the end), so no e-mail is sent and the link is read reliably.
 */
import { expect, test } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const EMAIL = `news.${RUN}@e2e.local`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    await c.query(`CREATE OR REPLACE FUNCTION e2e_hold_subscriber_mail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."subscriberId" IS NOT NULL AND NEW."jobId" IS NULL THEN NEW."nextAttemptAt" := (now() AT TIME ZONE 'UTC') + interval '1 day'; END IF;
        RETURN NEW;
      END $$`);
    await c.query(`DROP TRIGGER IF EXISTS e2e_hold_subscriber_mail ON "EmailDelivery"`);
    await c.query(`CREATE TRIGGER e2e_hold_subscriber_mail BEFORE INSERT ON "EmailDelivery" FOR EACH ROW EXECUTE FUNCTION e2e_hold_subscriber_mail()`);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query(`DROP TRIGGER IF EXISTS e2e_hold_subscriber_mail ON "EmailDelivery"`);
    await c.query(`DROP FUNCTION IF EXISTS e2e_hold_subscriber_mail()`);
    // The held welcome e-mail is never sent.
    await c.query(`DELETE FROM "EmailDelivery" WHERE "subscriberId" IN (SELECT id FROM "Subscriber" WHERE email = $1) AND status = 'PENDING'`, [EMAIL]);
  });
});

test("a visitor subscribes on the home page; an Administrator sees them; the unsubscribe link works; the Administrator sees that", async ({ page, browser }) => {
  // 1. Subscribe from the home page.
  await page.goto("/");
  const form = page.getByTestId("subscribe-form");
  await form.scrollIntoViewIfNeeded({ timeout: 60_000 });
  await form.locator("#news-name").fill("Grace Newsreader");
  await form.locator("#news-email").fill(EMAIL.toUpperCase());
  await form.getByLabel("Physics").check();
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByText(`You will receive Rwanda Olympiad Foundation news at ${EMAIL.toUpperCase()}`)).toBeVisible({ timeout: 30_000 });

  const row = await withDb(async (c) => (await c.query(`SELECT id, status, interests::text[] AS interests, source, "fullName" FROM "Subscriber" WHERE email = $1`, [EMAIL])).rows[0]);
  expect(row).toMatchObject({ status: "ACTIVE", interests: ["PHYSICS"], source: "WEBSITE", fullName: "Grace Newsreader" });

  // The welcome e-mail carries the person's own unsubscribe link.
  const body: string = await withDb(async (c) => (await c.query(`SELECT body FROM "EmailDelivery" WHERE "subscriberId" = $1`, [row.id])).rows[0].body);
  const link = body.match(/https?:\/\/\S+\/unsubscribe\?s=\S+/)?.[0];
  expect(link, "unsubscribe link in the welcome e-mail").toBeTruthy();
  expect(link).toContain(`s=${row.id}`);

  // 2. The Administrator finds them.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, "admin");
  await admin.goto(`/admin/subscribers?q=${encodeURIComponent(EMAIL)}`);
  const adminRow = admin.locator(`[data-testid="subscriber-row"][data-email="${EMAIL}"]`);
  await expect(adminRow).toBeVisible({ timeout: 30_000 });
  await expect(adminRow).toContainText("Grace Newsreader");
  await expect(adminRow).toContainText("Physics");
  await expect(adminRow).toContainText("Subscribed");
  await expect(admin.getByTestId("subscriber-summary")).toBeVisible();

  // 3. The visitor unsubscribes with the link (opening it changes nothing; the button does).
  const url = new URL(link!);
  await page.goto(`${url.pathname}${url.search}`);
  await expect(page.getByRole("heading", { name: "Unsubscribe from ROF news" })).toBeVisible({ timeout: 30_000 });
  expect(await withDb(async (c) => (await c.query(`SELECT status FROM "Subscriber" WHERE id = $1`, [row.id])).rows[0].status)).toBe("ACTIVE");
  await page.getByLabel(/Why are you leaving/).fill("Testing the link");
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByTestId("unsubscribed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Subscribe again" })).toHaveAttribute("href", "/#news");
  expect(await withDb(async (c) => (await c.query(`SELECT status, "unsubscribeReason" FROM "Subscriber" WHERE id = $1`, [row.id])).rows[0]))
    .toEqual({ status: "UNSUBSCRIBED", unsubscribeReason: "Testing the link" });

  // A broken link is refused in plain words.
  await page.goto(`/unsubscribe?s=${row.id}&t=not-the-token`);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByText(/This unsubscribe link is not valid/)).toBeVisible({ timeout: 30_000 });

  // 4. The Administrator sees the change.
  await admin.reload();
  await expect(adminRow).toContainText("Unsubscribed", { timeout: 30_000 });
  await expect(adminRow).toContainText("Testing the link");
  await adminContext.close();
});

test("an Administrator composes an update: the recipient count, queued only for ACTIVE subscribers of the audience; then cancels it", async ({ page }) => {
  const expected = await withDb(async (c) => Number((await c.query(
    `SELECT count(*) FROM "Subscriber" WHERE status = 'ACTIVE' AND ('PHYSICS' = ANY(interests) OR cardinality(interests) = 0)`,
  )).rows[0].count));
  // At least one recipient, so there is something to send.
  if (expected === 0) {
    await withDb((c) => c.query(
      `INSERT INTO "Subscriber" (id, email, interests, source, "updatedAt") VALUES (gen_random_uuid()::text, $1, '{PHYSICS}', 'ADMIN', now())`,
      [`reader.${RUN}@e2e.local`],
    ));
  }
  const recipients = expected || 1;
  const subject = `Physics Olympiad ${RUN}`;

  await signIn(page, "admin");
  await page.goto("/admin/subscribers?tab=compose");
  await page.locator("#mailing-subject").fill(subject);
  await page.locator("#mailing-body").fill("The Physics Olympiad opens soon.\n\nRegister on the ROF website.");
  await page.getByRole("group", { name: "Who receives it" }).getByLabel("Physics").check();
  await expect(page.getByTestId("mailing-recipients")).toContainText(`${recipients} recipient`, { timeout: 30_000 });
  await page.getByRole("button", { name: new RegExp(`^Send to ${recipients} subscriber`) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`It goes to ${recipients} subscriber`);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`is queued for ${recipients} subscriber`)).toBeVisible({ timeout: 30_000 });

  const mailing = await withDb(async (c) => (await c.query(`SELECT id, status, "recipientCount", "emailJobId" FROM "Mailing" WHERE subject = $1`, [subject])).rows[0]);
  expect(mailing).toMatchObject({ status: "QUEUED", recipientCount: recipients });
  const queued = await withDb(async (c) => (await c.query(
    `SELECT d."recipientEmail", s.status FROM "EmailDelivery" d JOIN "Subscriber" s ON s.id = d."subscriberId" WHERE d."jobId" = $1`, [mailing.emailJobId],
  )).rows);
  expect(queued).toHaveLength(recipients);
  expect(queued.every((d) => d.status === "ACTIVE")).toBe(true);
  expect(queued.map((d) => d.recipientEmail)).not.toContain(EMAIL);   // unsubscribed in the first test

  // The history shows it waiting; cancel it before anything is sent.
  const historyRow = page.getByTestId("mailing-row").filter({ hasText: subject });
  await expect(historyRow).toContainText("Waiting to send");
  await expect(historyRow.getByTestId("mailing-recipients-count")).toContainText(String(recipients));
  await historyRow.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel the mailing" }).click();
  await expect(page.getByText(/The mailing was cancelled/)).toBeVisible({ timeout: 30_000 });
  await expect(historyRow).toContainText("Cancelled");
  expect(await withDb(async (c) => (await c.query(`SELECT status FROM "Mailing" WHERE id = $1`, [mailing.id])).rows[0].status)).toBe("CANCELLED");
  expect(await withDb(async (c) => Number((await c.query(`SELECT count(*) FROM "EmailDelivery" WHERE "jobId" = $1`, [mailing.emailJobId])).rows[0].count))).toBe(0);
});
