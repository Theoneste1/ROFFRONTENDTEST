/**
 * News subscribers and mailings (capability `subscribers`, owner 2026-11-23). Backend: docs/SUBSCRIBERS.md.
 * Public: POST /public/subscribe, /public/unsubscribe. Administrators (subscribers.manage): /admin/subscribers….
 */
import { api, type QueryValue } from "./client";
import { downloadCsv } from "./admin";
import type { Page } from "./types";
import type {
  Audience, MailingStatus, OlympiadSubject, SubscriberFilters, SubscriberKind, SubscriberSource, SubscriberStatus,
} from "../subscribers/rules";

export interface Subscriber {
  id: string;
  email: string;
  fullName: string | null;
  kind: SubscriberKind | null;
  interests: OlympiadSubject[];
  country: string | null;
  source: SubscriberSource;
  status: SubscriberStatus;
  subscribedAt: string;
  unsubscribedAt: string | null;
  unsubscribeReason: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriberSummary {
  active: number;
  unsubscribed: number;
  bySource: Partial<Record<SubscriberSource, number>>;
  byKind: Partial<Record<SubscriberKind | "NOT_GIVEN", number>>;
  byInterest: Record<OlympiadSubject | "ALL_SUBJECTS", number>;
}

export interface SubscriberInput {
  email?: string;
  fullName?: string | null;
  kind?: SubscriberKind | null;
  interests?: OlympiadSubject[];
  country?: string | null;
  status?: SubscriberStatus;
  reason?: string;
}

export interface ImportProblem { line: number; email: string; problem: string }
export interface ImportResult {
  dryRun: boolean;
  rows: number;
  wouldAdd?: number;
  added?: number;
  alreadyListed: number;
  unsubscribed: number;
  invalid: number;
  problems: ImportProblem[];
  problemsTruncated: boolean;
}

export interface Mailing {
  id: string;
  subject: string;
  body?: string;
  audience: Audience;
  status: MailingStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  cancelledCount: number;
  pendingCount: number;
  emailJobId: string | null;
  createdAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
  sendsAfter: string | null;
  createdBy: { id: string; username: string; firstName: string; lastName: string };
  alreadyExisted?: boolean;
  withdrawn?: number;
}

const A = "/admin/subscribers";
const query = (f: SubscriberFilters & { limit?: number }) => ({ ...f }) as Record<string, QueryValue>;

export const publicSubscribersApi = {
  subscribe: (body: Record<string, unknown>) => api<{ received: true; message: string }>("/public/subscribe", { method: "POST", body, auth: false }),
  unsubscribe: (body: { id: string; token: string; reason?: string }) =>
    api<{ unsubscribed: true }>("/public/unsubscribe", { method: "POST", body, auth: false }),
};

export const subscribersApi = {
  list: (f: SubscriberFilters & { limit?: number } = {}) => api<Page<Subscriber>>(A, { query: query(f) }),
  summary: () => api<SubscriberSummary>(`${A}/summary`),
  exportCsv: (f: SubscriberFilters = {}) => {
    const { page: _p, ...rest } = f;
    void _p;
    return downloadCsv(`${A}/export`, query(rest), "subscribers.csv");
  },
  create: (input: SubscriberInput) => api<Subscriber>(A, { method: "POST", body: input }),
  update: (id: string, input: SubscriberInput) => api<Subscriber>(`${A}/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => api<{ deleted: true }>(`${A}/${id}`, { method: "DELETE" }),
  importCsv: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append("file", file);
    return api<ImportResult>(`${A}/import`, { method: "POST", body: form, query: dryRun ? { dryRun: "true" } : {} });
  },
  // Mailings
  mailings: (page = 1) => api<Page<Mailing>>(`${A}/mailings`, { query: { page, limit: 20 } }),
  mailing: (id: string) => api<Mailing>(`${A}/mailings/${id}`),
  preview: (audience: Audience) => api<{ audience: Audience; recipients: number }>(`${A}/mailings/preview`, { method: "POST", body: { audience } }),
  sendTest: (subject: string, body: string) => api<{ sentTo: string }>(`${A}/mailings/test`, { method: "POST", body: { subject, body } }),
  send: (input: { subject: string; body: string; audience: Audience; idempotencyKey: string }) =>
    api<Mailing>(`${A}/mailings`, { method: "POST", body: input }),
  cancel: (id: string) => api<Mailing>(`${A}/mailings/${id}/cancel`, { method: "POST" }),
};
