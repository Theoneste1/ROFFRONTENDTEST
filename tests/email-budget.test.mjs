// E-mail within the Resend Free plan (lib/admin-ops/email-budget.ts; capability `emailBudget`, owner 2026-11-24): the
// "Sending today" panel's text on the admin E-mail page.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DRY_RUN_NOTE, dailyLine, discardedLine, emailBudgetSupported, failedLine, kigaliTime, monthlyLine, notSentStatus, pausedText,
  recoverConfirmText, recoverLabel, recoverOutcome, waitingText,
} from "../lib/admin-ops/email-budget.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { ApiError } from "../lib/api/errors.ts";

// 2026-11-24 10:00 Kigali (UTC+2).
const NOW = new Date("2026-11-24T08:00:00Z");
const usage = (over = {}) => ({
  generatedAt: NOW.toISOString(),
  dryRun: false,
  limits: {
    dailyLimit: 100, monthlyLimit: 3000, dailySafetyMargin: 5, monthlySafetyMargin: 100, dailyBudget: 95, monthlyBudget: 2900,
    dayWindow: "UTC_CALENDAR_DAY", monthWindow: "ROLLING_31_DAYS", normalSharePercent: 80, bulkSharePercent: 50,
  },
  sent: { today: 62, last31d: 1204, sendingNow: 0, last24h: 70, thisMonthUtc: 900 },
  dayResetsAt: "2026-11-25T00:00:00Z",
  remaining: { today: 33, month: 1696 },
  nextFreeAt: null,
  priorities: [],
  queued: { CRITICAL: 3, NORMAL: 9, BULK: 0, total: 12 },
  failed: { total: 0, emails: 0, decisionNotices: 0 },
  discarded: { total: 0, reasons: [] },
  status: { paused: false, reason: null, until: null, lastProviderError: null, lastProviderPauseAt: null },
  recoverableQuotaFailures: 0,
  ...over,
});
const at1405 = "2026-11-24T12:05:00Z";

test("emailBudget is a known feature; only a NEW backend with it shows the panel", () => {
  assert.ok(KNOWN_FEATURES.includes("emailBudget"));
  assert.equal(emailBudgetSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["emailBudget"] }), true);
  assert.equal(emailBudgetSupported({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(emailBudgetSupported({ state: "LEGACY" }), false);
  assert.equal(emailBudgetSupported(null), false);
});

test("times are Kigali time: the hour today, the date otherwise", () => {
  assert.equal(kigaliTime(at1405, NOW), "14:05");
  assert.equal(kigaliTime("2026-11-25T06:30:00Z", NOW), "25 Nov 08:30");
});

test("normal day: used of the day's budget (Resend's day restarts at 00:00 UTC = 02:00 Kigali), next free slot, what waits", () => {
  assert.equal(dailyLine(usage(), NOW), "62 of 95 e-mails used today (the count restarts at 25 Nov 02:00 Kigali time) · 12 waiting (3 urgent)");
  assert.equal(dailyLine(usage({ nextFreeAt: at1405 }), NOW), "62 of 95 e-mails used today (the count restarts at 25 Nov 02:00 Kigali time) · next free slot at 14:05 Kigali time · 12 waiting (3 urgent)");
  assert.equal(monthlyLine(usage()), "1,204 of 2,900 this month (last 31 days)");
  assert.equal(pausedText(usage(), NOW), null);
});

test("no limit (e.g. Resend Pro: no daily limit): plain counts", () => {
  const u = usage({ limits: { ...usage().limits, dailyLimit: 0, dailyBudget: null, monthlyLimit: 0, monthlyBudget: null } });
  assert.equal(dailyLine(u, NOW), "62 e-mails sent today (no daily limit) · 12 waiting (3 urgent)");
  assert.equal(monthlyLine(u), "1,204 in the last 31 days (no monthly limit)");
});

test("nothing waiting", () => {
  const u = usage({ queued: { CRITICAL: 0, NORMAL: 0, BULK: 0, total: 0 } });
  assert.equal(waitingText(u), "nothing waiting");
  assert.equal(dailyLine(u, NOW), "62 of 95 e-mails used today (the count restarts at 25 Nov 02:00 Kigali time) · nothing waiting");
  assert.equal(waitingText(usage({ queued: { CRITICAL: 0, NORMAL: 4, BULK: 1, total: 5 } })), "5 waiting");
  assert.equal(pausedText({ ...u, status: { ...u.status, paused: true, reason: "DAILY_LIMIT", until: at1405 } }, NOW), "Daily e-mail limit reached — nothing is waiting.");
});

test("paused by the daily limit: how many wait and from when they go out by themselves", () => {
  const u = usage({ sent: { ...usage().sent, today: 95 }, nextFreeAt: at1405, status: { paused: true, reason: "DAILY_LIMIT", until: at1405, lastProviderError: null, lastProviderPauseAt: null } });
  assert.equal(pausedText(u, NOW), "Daily e-mail limit reached — 12 e-mails are waiting and will go out automatically from 14:05.");
  const one = { ...u, queued: { CRITICAL: 1, NORMAL: 0, BULK: 0, total: 1 } };
  assert.equal(pausedText(one, NOW), "Daily e-mail limit reached — 1 e-mail is waiting and will go out automatically from 14:05.");
});

test("paused by the monthly limit, and by the e-mail service itself", () => {
  const status = (reason, until) => ({ paused: true, reason, until, lastProviderError: null, lastProviderPauseAt: null });
  assert.equal(pausedText(usage({ status: status("MONTHLY_LIMIT", "2026-12-10T07:00:00Z") }), NOW),
    "Monthly e-mail limit reached — 12 e-mails are waiting and will go out automatically from 10 Dec 09:00.");
  assert.equal(pausedText(usage({ status: status("PROVIDER_DAILY_QUOTA", at1405) }), NOW),
    "The e-mail service reports its daily limit reached — 12 e-mails are waiting and will go out automatically from 14:05.");
  assert.match(pausedText(usage({ status: status("PROVIDER_RATE_LIMIT", null) }), NOW), /slow down — 12 e-mails are waiting and will go out automatically as soon as the limit allows\.$/);
});

test("dry run, failed and dropped e-mails", () => {
  assert.match(DRY_RUN_NOTE, /not actually sent/);
  assert.equal(failedLine(usage()), "No failed e-mails");
  assert.equal(failedLine(usage({ failed: { total: 2, emails: 1, decisionNotices: 1 } })), "2 e-mails failed");
  assert.equal(discardedLine(usage()), "No e-mails dropped");
  assert.equal(discardedLine(usage({ discarded: { total: 43, reasons: [] } })), "43 e-mails not sent because the link in them was no longer valid");
  assert.equal(discardedLine(usage({ discarded: { total: 1, reasons: [] } })), "1 e-mail not sent because the link in it was no longer valid");
  assert.equal(notSentStatus("DISCARDED"), "DISCARDED");
  assert.equal(notSentStatus(null), "FAILED");
  assert.equal(notSentStatus("SENT"), "FAILED");
});

test("recovering e-mails that failed only because of the daily limit: label, confirmation, outcome", () => {
  assert.equal(recoverLabel(usage()), null);
  assert.equal(recoverLabel(usage({ recoverableQuotaFailures: 7 })), "Retry e-mails that failed only because of the daily limit (7)");
  assert.match(recoverConfirmText(7), /^Send 7 e-mails again\? They failed only because/);
  assert.deepEqual(recoverOutcome({ requeued: 7, emails: 0, decisionNotices: 7 }, null),
    { tone: "success", text: "7 e-mails queued again. They go out automatically within the daily limit." });
  assert.equal(recoverOutcome(null, new ApiError(409, "NOTHING_TO_RECOVER", "x")).tone, "info");
  assert.equal(recoverOutcome(null, new Error("boom")).tone, "error");
});
