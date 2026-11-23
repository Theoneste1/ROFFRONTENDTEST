/**
 * E-mail within the Resend Free plan in the browser (owner 2026-11-24; capability `emailBudget`): an Administrator opens
 * the E-mail page and sees the "Sending today" panel — the e-mails used in the last 24 hours against the budget of 95,
 * the month line, what is waiting (urgent ones counted), and, with the daily budget used up, the plain message that the
 * waiting e-mails go out automatically from the next free slot. Then the dropped e-mails list shows the DISCARDED status
 * with its reason.
 *
 * Seeded in the disposable test database (synthetic addresses, unique per run): 95 e-mails SENT an hour ago, 3 urgent
 * and 2 ordinary e-mails waiting, one dropped e-mail. Everything seeded is removed at the end.
 */
import { expect, test } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const DOMAIN = `budget-${RUN}.e2e.local`;
const REASON = "Not sent: the account is already activated (for example by an administrator), so the link is no longer needed.";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await withDb(async (c) => {
    // 95 e-mails sent an hour ago: the daily budget (100 minus the safety margin of 5) is used up for 23 hours.
    await c.query(`INSERT INTO "EmailDelivery" (id, "recipientEmail", subject, status, attempts, "attemptedAt", kind, priority)
      SELECT gen_random_uuid()::text, 'sent' || g || '@${DOMAIN}', 'Earlier notice', 'SENT', 1, (now() AT TIME ZONE 'UTC') - interval '1 hour', 'NOTIFICATION', 'NORMAL'
      FROM generate_series(1, 95) g`);
    await c.query(`INSERT INTO "EmailDelivery" (id, "recipientEmail", subject, body, status, kind, priority)
      SELECT gen_random_uuid()::text, 'urgent' || g || '@${DOMAIN}', 'Security notice', 'Hello', 'PENDING', 'SECURITY_NOTICE', 'CRITICAL'
      FROM generate_series(1, 3) g`);
    await c.query(`INSERT INTO "EmailDelivery" (id, "recipientEmail", subject, body, status, kind, priority)
      SELECT gen_random_uuid()::text, 'normal' || g || '@${DOMAIN}', 'Notice', 'Hello', 'PENDING', 'NOTIFICATION', 'NORMAL'
      FROM generate_series(1, 2) g`);
    await c.query(`INSERT INTO "EmailDelivery" (id, "recipientEmail", subject, status, "errorMessage", "attemptedAt", kind, priority)
      VALUES (gen_random_uuid()::text, 'dropped@${DOMAIN}', 'Confirm your e-mail address', 'DISCARDED', $1, now() AT TIME ZONE 'UTC', 'EMAIL_VERIFICATION', 'CRITICAL')`, [REASON]);
  });
});

test.afterAll(async () => {
  await withDb((c) => c.query(`DELETE FROM "EmailDelivery" WHERE "recipientEmail" LIKE $1`, [`%@${DOMAIN}`]));
});

test("an Administrator sees how much of the daily e-mail budget is used, what waits, and that it goes out automatically", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/email");
  const panel = page.getByTestId("sending-today");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("heading", { name: "Sending today" })).toBeVisible();

  // At least the 95 seeded (other specs may have sent a few more) of the budget of 95.
  const daily = panel.getByTestId("sending-daily");
  await expect(daily).toHaveText(/^(9[5-9]|\d{3,}) of 95 e-mails used in the last 24 hours · next free slot at (\d{1,2} \w{3} )?\d{2}:\d{2} Kigali time · \d+ waiting \(\d+ urgent\)$/);
  const urgent = Number(/\((\d+) urgent\)/.exec((await daily.textContent()) ?? "")![1]);
  expect(urgent).toBeGreaterThanOrEqual(3);
  await expect(panel.getByTestId("sending-monthly")).toHaveText(/^\d[\d,]* of 2,900 this month \(last 30 days\)$/);

  // Paused by the daily limit, in plain words, with the time the waiting e-mails go out.
  await expect(panel.getByTestId("sending-paused")).toHaveText(
    /^Daily e-mail limit reached — \d+ e-mails are waiting and will go out automatically from (\d{1,2} \w{3} )?\d{2}:\d{2}\.$/,
  );
  await expect(panel.getByText(/Test mode: e-mails are recorded but not actually sent/)).toBeVisible();
  await expect(panel.getByTestId("sending-discard-reasons")).toContainText(REASON);

  // The seeded e-mails are still waiting: nothing was sent past the budget, no attempt was spent.
  const waiting = await withDb((c) => c.query<{ n: string }>(
    `SELECT count(*) AS n FROM "EmailDelivery" WHERE "recipientEmail" LIKE $1 AND status = 'PENDING' AND attempts = 0`, [`%@${DOMAIN}`]));
  expect(Number(waiting.rows[0].n)).toBe(5);

  // The dropped e-mails list: the DISCARDED status with its reason; no retry offered.
  await panel.getByTestId("sending-discarded").click();
  await expect(page).toHaveURL(/\/admin\/email\/failed\?status=DISCARDED/);
  await expect(page.getByRole("button", { name: "Not sent (link no longer valid)" })).toHaveAttribute("aria-pressed", "true");
  const row = page.getByTestId("failed-delivery-row").filter({ hasText: `dropped@${DOMAIN}` });
  await expect(row).toContainText(REASON);
  await expect(row.getByRole("button", { name: "Retry" })).toHaveCount(0);
});
