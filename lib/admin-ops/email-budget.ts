/**
 * E-mail within the Resend Free plan (capability `emailBudget`, owner 2026-11-24: 100 e-mails a day, 3,000 a month).
 * Pure text for the "Sending today" panel on the admin E-mail page, from GET /admin/email/usage. Unit-tested in
 * tests/email-budget.test.mjs. Backend: docs/EMAIL.md §10.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { isApiError } from "../api/errors";

export type EmailPriority = "CRITICAL" | "NORMAL" | "BULK";
export type BudgetPauseReason = "DAILY_LIMIT" | "MONTHLY_LIMIT" | "PROVIDER_DAILY_QUOTA" | "PROVIDER_MONTHLY_QUOTA" | "PROVIDER_RATE_LIMIT";

export interface EmailUsage {
  generatedAt: string;
  dryRun: boolean;
  limits: {
    dailyLimit: number; monthlyLimit: number; dailySafetyMargin: number; monthlySafetyMargin: number;
    dailyBudget: number; monthlyBudget: number; normalSharePercent: number; bulkSharePercent: number;
  };
  sent: { last24h: number; last30d: number; sendingNow: number; todayUtc: number; thisMonthUtc: number };
  remaining: { last24h: number; last30d: number };
  nextFreeAt: string | null;
  priorities: { priority: EmailPriority; cap24h: number; cap30d: number; remaining: number; blockedBy: "DAY" | "MONTH" | null; nextFreeAt: string | null; queued: number }[];
  queued: Record<EmailPriority, number> & { total: number };
  failed: { total: number; emails: number; decisionNotices: number };
  discarded: { total: number; reasons: { reason: string; count: number }[] };
  status: { paused: boolean; reason: BudgetPauseReason | null; until: string | null; lastProviderError: string | null; lastProviderPauseAt: string | null };
  recoverableQuotaFailures: number;
}

export interface RecoverResult {
  requeued: number;
  emails: number;
  decisionNotices: number;
}

export const emailBudgetSupported = (detection: BackendDetection | null | undefined) => hasFeature(detection, "emailBudget");

const n = (x: number) => x.toLocaleString("en-US");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;

const KIGALI = "Africa/Kigali";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KIGALI, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** "14:05" today (Kigali), otherwise "25 Nov 14:05". */
export function kigaliTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  if (dayKey(d) === dayKey(now)) return time;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI, day: "numeric", month: "short" }).format(d);
  return `${date} ${time}`;
}

/** "12 waiting (3 urgent)" / "nothing waiting". */
export function waitingText(u: Pick<EmailUsage, "queued">): string {
  if (u.queued.total === 0) return "nothing waiting";
  return u.queued.CRITICAL > 0 ? `${n(u.queued.total)} waiting (${n(u.queued.CRITICAL)} urgent)` : `${n(u.queued.total)} waiting`;
}

/** The main line: "62 of 95 e-mails used in the last 24 hours · next free slot at 14:05 Kigali time · 12 waiting (3 urgent)". */
export function dailyLine(u: EmailUsage, now: Date = new Date()): string {
  const parts = [`${n(u.sent.last24h)} of ${n(u.limits.dailyBudget)} e-mails used in the last 24 hours`];
  if (u.nextFreeAt) parts.push(`next free slot at ${kigaliTime(u.nextFreeAt, now)} Kigali time`);
  parts.push(waitingText(u));
  return parts.join(" · ");
}

/** "1,204 of 2,900 this month (last 30 days)". */
export function monthlyLine(u: EmailUsage): string {
  return `${n(u.sent.last30d)} of ${n(u.limits.monthlyBudget)} this month (last 30 days)`;
}

const PAUSE_HEADLINE: Record<BudgetPauseReason, string> = {
  DAILY_LIMIT: "Daily e-mail limit reached",
  MONTHLY_LIMIT: "Monthly e-mail limit reached",
  PROVIDER_DAILY_QUOTA: "The e-mail service reports its daily limit reached",
  PROVIDER_MONTHLY_QUOTA: "The e-mail service reports its monthly limit reached",
  PROVIDER_RATE_LIMIT: "The e-mail service asked us to slow down",
};

/**
 * Plain words when sending is held back, e.g. "Daily e-mail limit reached — 12 e-mails are waiting and will go out
 * automatically from 14:05." Null when sending is not paused.
 */
export function pausedText(u: EmailUsage, now: Date = new Date()): string | null {
  if (!u.status.paused || !u.status.reason) return null;
  const head = PAUSE_HEADLINE[u.status.reason] ?? "Sending is paused";
  const waiting = u.queued.total === 0
    ? "nothing is waiting"
    : `${plural(u.queued.total, "e-mail")} ${u.queued.total === 1 ? "is" : "are"} waiting`;
  if (u.queued.total === 0) return `${head} — ${waiting}.`;
  const when = u.status.until ? ` from ${kigaliTime(u.status.until, now)}` : " as soon as the limit allows";
  return `${head} — ${waiting} and will go out automatically${when}.`;
}

export const DRY_RUN_NOTE = "Test mode: e-mails are recorded but not actually sent (no e-mail service is connected).";

export function failedLine(u: Pick<EmailUsage, "failed">): string {
  return u.failed.total === 0 ? "No failed e-mails" : `${plural(u.failed.total, "e-mail")} failed`;
}

export function discardedLine(u: Pick<EmailUsage, "discarded">): string {
  return u.discarded.total === 0
    ? "No e-mails dropped"
    : `${plural(u.discarded.total, "e-mail")} not sent because the link in ${u.discarded.total === 1 ? "it" : "them"} was no longer valid`;
}

/** The recovery button, or null when there is nothing to recover. */
export function recoverLabel(u: Pick<EmailUsage, "recoverableQuotaFailures">): string | null {
  return u.recoverableQuotaFailures > 0 ? `Retry e-mails that failed only because of the daily limit (${n(u.recoverableQuotaFailures)})` : null;
}

export function recoverConfirmText(count: number): string {
  return `Send ${plural(count, "e-mail")} again? ${count === 1 ? "It" : "They"} failed only because the e-mail service's daily limit was reached. ` +
    "Each goes out once, most urgent first, within the daily limit. Links that are no longer valid are dropped, not sent.";
}

/** The notice after the recovery (error = null on success). */
export function recoverOutcome(result: RecoverResult | null, error: unknown): { tone: "success" | "info" | "error"; text: string } {
  if (result) return { tone: "success", text: `${plural(result.requeued, "e-mail")} queued again. ${result.requeued === 1 ? "It goes" : "They go"} out automatically within the daily limit.` };
  if (isApiError(error) && error.code === "NOTHING_TO_RECOVER") return { tone: "info", text: "There is nothing to send again: no e-mail failed only because of the daily limit." };
  return { tone: "error", text: "The e-mails could not be queued again. Try again in a minute; if it keeps failing, tell the technical team." };
}

/** Delivery statuses shown on the failed / not-sent list. */
export const NOT_SENT_STATUSES = [
  { value: "FAILED", label: "Failed" },
  { value: "DISCARDED", label: "Not sent (link no longer valid)" },
] as const;
export type NotSentStatus = (typeof NOT_SENT_STATUSES)[number]["value"];

export function notSentStatus(raw: string | null): NotSentStatus {
  return raw === "DISCARDED" ? "DISCARDED" : "FAILED";
}
