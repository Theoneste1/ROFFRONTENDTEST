/**
 * An Administrator reviews coach applications in the browser (REG-10): asks one applicant for more information,
 * rejects one with a reason (e-mailed to the applicant) and approves one. Each outcome is checked in the database.
 * The three applications are created through the public API (as the /apply form does), with unique names per run.
 * The applicant then answers the question through the e-mailed one-time link (/applications/respond), signed out.
 */
import { expect, request, test, type Page } from "@playwright/test";
import { withDb } from "../support/db";
import { signIn } from "../support/session";

const RUN = Date.now().toString(36);
const who = (k: string) => ({ firstName: "Review", lastName: `${k}${RUN}`, username: `review.${k.toLowerCase()}.${RUN}` });

async function applyAsCoach(k: string) {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL ?? "http://127.0.0.1:4100" });
  try {
    const p = who(k);
    const r = await api.post("/api/v1/mentor-requests", {
      data: {
        ...p, email: `${p.username}@e2e.local`, password: "Coach-Pass-2026!", country: "RW", occupation: "Engineer", educationLevel: "BACHELOR",
        olympiadInterests: ["MATHEMATICS"], phone: "0788222333", expertise: "Number theory.", relevantExperience: "Two years of olympiad training.",
      },
    });
    expect(r.ok(), await r.text()).toBe(true);
  } finally {
    await api.dispose();
  }
}

const statusOf = (username: string) => withDb(async (c) =>
  (await c.query(`SELECT id, status::text AS status, "rejectionReason" AS reason FROM "MentorRequest" WHERE username = $1`, [username])).rows[0]);

async function openApplications(page: Page) {
  await page.goto("/admin/mentors");
  await page.getByRole("tab", { name: /Applications/ }).click();
}

const rowOf = (page: Page, k: string) => page.locator("tr", { hasText: `Review ${k}${RUN}` });

const LINK = /(\/applications\/respond\?token=[^\s"&<]+)/;

/**
 * Asks the "Ask" applicant a question and returns the answer link from the queued e-mail. The watch (one connection,
 * every 25 ms) starts before the question is sent, so the link is read while the message is queued; the worker clears
 * the body once it sends. If the worker wins anyway (a sent row with no body), the question is asked again — which
 * replaces the earlier question and link — up to three times.
 */
async function askAndCaptureLink(page: Page, question: string): Promise<string | undefined> {
  const recipient = `${who("Ask").username}@e2e.local`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // The newest message for this applicant before asking; the watch waits for a different (newer) one. (Ids, not
    // timestamps: "createdAt" is stored without a time zone, so comparing it with a local Date would be off by the offset.)
    const latest = `SELECT id, body FROM "EmailDelivery" WHERE "recipientEmail" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 1`;
    const before = await withDb(async (c) => (await c.query<{ id: string }>(latest, [recipient])).rows[0]?.id ?? null);
    const watch = withDb(async (c) => {
      const until = Date.now() + 30_000;
      while (Date.now() < until) {
        const found = (await c.query<{ id: string; body: string | null }>(latest, [recipient])).rows[0];
        const row = found && found.id !== before ? found : undefined;
        if (row?.body) return LINK.exec(row.body)?.[1];
        if (row && row.body === null) return null;   // already sent and cleared: ask again
        await new Promise((r) => setTimeout(r, 25));
      }
      return undefined;
    });
    await rowOf(page, "Ask").getByTestId("ask-for-information").click();
    const ask = page.getByRole("dialog");
    await ask.getByLabel(/Question/).fill(question);
    await ask.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByText(/question sent by e-mail/)).toBeVisible({ timeout: 30_000 });
    const link = await watch;
    if (link !== null) return link;
    test.info().annotations.push({ type: "e-mail sent before capture", description: `attempt ${attempt}: asked again` });
  }
  return undefined;
}

test.describe("Administrator reviews coach applications", () => {
  test.beforeAll(async () => {
    for (const k of ["Ask", "Reject", "Approve"]) await applyAsCoach(k);
  });

  test("ask for more information, reject with a reason, approve", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await signIn(page, "admin");
    await openApplications(page);

    // 1. Ask for more information: the question is stored and the application stays pending.
    //    The e-mail worker (every 10 s) clears a sent message's body — one-time links are not kept — so the answer link
    //    is captured from the outbox while it is queued: the watch starts before "Send question". Should the worker
    //    still send it first, the Administrator asks again (that replaces the question and its link, as in real use).
    const link = await askAndCaptureLink(page, "Please tell us which olympiad levels you have coached and for how long.");
    const asked = await statusOf(who("Ask").username);
    expect(asked.status).toBe("PENDING");
    const question = await withDb(async (c) => (await c.query(
      `SELECT question, "answeredAt" IS NULL AS open FROM "ApplicationInfoRequest" WHERE "mentorRequestId" = $1`, [asked.id])).rows[0]);
    expect(question).toMatchObject({ question: expect.stringContaining("olympiad levels"), open: true });

    // 1b. The applicant answers through the e-mailed link (no account, signed out).
    expect(link, "the e-mail carries the answer link").toBeTruthy();
    const applicant = await (await browser.newContext()).newPage();
    await applicant.goto(link!);
    await expect(applicant.getByTestId("answer-form")).toBeVisible({ timeout: 30_000 });
    await expect(applicant.getByText(/olympiad levels/)).toBeVisible();
    await applicant.locator('textarea[name="answer"]').fill("National olympiad training for four years, junior and senior levels.");
    await applicant.getByRole("button", { name: "Send my answer" }).click();
    await expect(applicant.getByTestId("answer-sent")).toBeVisible({ timeout: 30_000 });
    const answered = await withDb(async (c) => (await c.query(
      `SELECT answer FROM "ApplicationInfoRequest" WHERE "mentorRequestId" = $1`, [asked.id])).rows[0].answer);
    expect(answered).toContain("four years");
    await applicant.close();

    // 2. Reject with a reason (required; e-mailed to the applicant).
    await rowOf(page, "Reject").getByRole("button", { name: "Reject" }).click();
    const reject = page.getByRole("dialog");
    await reject.getByRole("button", { name: "Reject" }).click();
    await expect(reject.getByText(/Reason .* must be/)).toBeVisible();   // empty reason refused in the dialog
    await reject.getByLabel(/Reason/).fill("We are not recruiting physics coaches this season; please apply again next year.");
    await reject.getByRole("button", { name: "Reject" }).click();
    await expect.poll(async () => (await statusOf(who("Reject").username)).status, { timeout: 30_000 }).toBe("REJECTED");
    expect((await statusOf(who("Reject").username)).reason).toContain("not recruiting");

    // 3. Approve: the request is approved and a coach account exists (awaiting its activation link).
    await rowOf(page, "Approve").getByRole("button", { name: "Approve" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect.poll(async () => (await statusOf(who("Approve").username)).status, { timeout: 30_000 }).toBe("APPROVED");
    const account = await withDb(async (c) => (await c.query(`SELECT role::text AS role FROM "User" WHERE username = $1`, [who("Approve").username])).rows[0]);
    expect(account).toEqual({ role: "MENTOR" });
  });
});
