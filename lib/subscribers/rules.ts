/**
 * News subscribers (capability `subscribers`, owner 2026-11-23): pure rules for the public subscribe box, the
 * /unsubscribe page and the administrators' Subscribers screen. Unit-tested in tests/subscribers.test.mjs.
 * Backend: docs/SUBSCRIBERS.md.
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";

export const SUBSCRIBERS_PERMISSION: Permission = "subscribers.manage";

export type OlympiadSubject = "MATHEMATICS" | "PHYSICS" | "COMPUTING";
export type SubscriberKind = "PARENT" | "STUDENT" | "TEACHER" | "SCHOOL" | "OTHER";
export type SubscriberSource = "WEBSITE" | "ADMIN" | "IMPORT";
export type SubscriberStatus = "ACTIVE" | "UNSUBSCRIBED";
export type MailingStatus = "QUEUED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
export type SubscriberSort = "newest" | "oldest" | "name" | "email";

export const SUBJECTS: readonly { value: OlympiadSubject; label: string }[] = [
  { value: "MATHEMATICS", label: "Mathematics" },
  { value: "PHYSICS", label: "Physics" },
  { value: "COMPUTING", label: "Computing" },
];

export const KINDS: readonly { value: SubscriberKind; label: string }[] = [
  { value: "PARENT", label: "Parent" },
  { value: "STUDENT", label: "Student" },
  { value: "TEACHER", label: "Teacher" },
  { value: "SCHOOL", label: "School" },
  { value: "OTHER", label: "Other" },
];

const KIND_PLURAL: Record<SubscriberKind, string> = { PARENT: "parents", STUDENT: "students", TEACHER: "teachers", SCHOOL: "schools", OTHER: "others" };

export const SOURCE_LABEL: Record<SubscriberSource, string> = { WEBSITE: "Website", ADMIN: "Added by an administrator", IMPORT: "Imported" };
export const STATUS_LABEL: Record<SubscriberStatus, string> = { ACTIVE: "Subscribed", UNSUBSCRIBED: "Unsubscribed" };
export const MAILING_STATUS_LABEL: Record<MailingStatus, string> = {
  QUEUED: "Waiting to send", SENDING: "Sending", SENT: "Sent", FAILED: "Failed", CANCELLED: "Cancelled",
};

export const subjectLabel = (s: OlympiadSubject) => SUBJECTS.find((x) => x.value === s)?.label ?? s;
export const kindLabel = (k: SubscriberKind | null | undefined) => (k ? KINDS.find((x) => x.value === k)?.label ?? k : "—");
/** "All subjects" when none was chosen (the backend's rule: no interest = every subject). */
export const interestsLabel = (xs: readonly OlympiadSubject[]) => (xs.length ? xs.map(subjectLabel).join(", ") : "All subjects");

/** The backend advertises the feature (public box, /unsubscribe page, admin screen). */
export function subscribersSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "subscribers");
}

/** The menu item: the backend feature AND the known subscribers.manage. */
export function subscribersNavVisible(detection: BackendDetection | null | undefined, permissions: ReadonlySet<string> | null): boolean {
  return subscribersSupported(detection) && !!permissions && permissions.has(SUBSCRIBERS_PERMISSION);
}

// ─── The public box ──────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SubscribeForm {
  name: string;
  email: string;
  interests: OlympiadSubject[];
}

/** Problems with the box's fields in plain words (the same limits as the backend). */
export function subscribeProblems(f: SubscribeForm): Partial<Record<"name" | "email", string>> {
  const out: Partial<Record<"name" | "email", string>> = {};
  const email = f.email.trim();
  if (!email) out.email = "Enter your e-mail address.";
  else if (email.length > 254 || !EMAIL.test(email)) out.email = "Enter a valid e-mail address, for example name@example.com.";
  const name = f.name.trim();
  if (name && (name.length < 2 || name.length > 100)) out.name = "Your name must be 2 to 100 characters, or leave it empty.";
  return out;
}

/** The request body for POST /public/subscribe (name only when given). */
export function subscribeBody(f: SubscribeForm, honeypot = ""): Record<string, unknown> {
  return {
    email: f.email.trim(),
    ...(f.name.trim() && { fullName: f.name.trim() }),
    ...(f.interests.length && { interests: [...new Set(f.interests)] }),
    ...(honeypot && { website: honeypot }),
  };
}

// ─── The /unsubscribe page ───────────────────────────────────────────────────

/** `s` and `t` from the link in the e-mail, or null when the link is incomplete. */
export function unsubscribeParams(params: { get(name: string): string | null }): { id: string; token: string } | null {
  const id = params.get("s")?.trim() ?? "";
  const token = params.get("t")?.trim() ?? "";
  return id && token && id.length <= 100 && token.length <= 200 ? { id, token } : null;
}

// ─── The administrators' list ────────────────────────────────────────────────

export interface SubscriberFilters {
  q?: string;
  status?: SubscriberStatus;
  interest?: OlympiadSubject;
  kind?: SubscriberKind;
  source?: SubscriberSource;
  country?: string;
  sort?: SubscriberSort;
  page?: number;
}

const STATUSES: readonly string[] = ["ACTIVE", "UNSUBSCRIBED"];
const SOURCES: readonly string[] = ["WEBSITE", "ADMIN", "IMPORT"];
const SORTS: readonly string[] = ["newest", "oldest", "name", "email"];

/** The filters from the page address (unknown values are ignored, so an old or edited link never breaks the page). */
export function filtersFromParams(params: { get(name: string): string | null }): SubscriberFilters {
  const pick = (name: string, allowed: readonly string[]) => {
    const v = params.get(name);
    return v && allowed.includes(v) ? v : undefined;
  };
  const out: SubscriberFilters = {};
  const q = params.get("q")?.trim();
  if (q) out.q = q.slice(0, 100);
  const status = pick("status", STATUSES);
  if (status) out.status = status as SubscriberStatus;
  const interest = pick("interest", SUBJECTS.map((s) => s.value));
  if (interest) out.interest = interest as OlympiadSubject;
  const kind = pick("kind", KINDS.map((k) => k.value));
  if (kind) out.kind = kind as SubscriberKind;
  const source = pick("source", SOURCES);
  if (source) out.source = source as SubscriberSource;
  const country = params.get("country")?.trim().toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country)) out.country = country;
  const sort = pick("sort", SORTS);
  if (sort) out.sort = sort as SubscriberSort;
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** The page address for some filters (empty values and the defaults left out). */
export function filtersToQuery(f: SubscriberFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || (k === "page" && v === 1) || (k === "sort" && v === "newest")) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

// ─── Mailings ────────────────────────────────────────────────────────────────

export interface Audience {
  interests?: OlympiadSubject[];
  kinds?: SubscriberKind[];
  countries?: string[];
}

/** Only non-empty lists (the backend stores the same). */
export function cleanAudience(a: Audience): Audience {
  const out: Audience = {};
  if (a.interests?.length) out.interests = [...new Set(a.interests)];
  if (a.kinds?.length) out.kinds = [...new Set(a.kinds)];
  const countries = [...new Set((a.countries ?? []).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))];
  if (countries.length) out.countries = countries;
  return out;
}

/** "Everyone subscribed" or the parts of the audience in words. */
export function audienceSummary(a: Audience, countryName: (code: string) => string = (c) => c): string {
  const parts: string[] = [];
  if (a.interests?.length) parts.push(`interested in ${a.interests.map(subjectLabel).join(" or ")} (or every subject)`);
  if (a.kinds?.length) parts.push(`who are ${a.kinds.map((k) => KIND_PLURAL[k]).join(" or ")}`);
  if (a.countries?.length) parts.push(`in ${a.countries.map(countryName).join(", ")}`);
  return parts.length ? `Subscribers ${parts.join("; ")}` : "Everyone subscribed";
}

export interface MailingDraft {
  subject: string;
  body: string;
}

/** The same limits as the backend: subject 3–150 characters, message 10–20,000. */
export function mailingProblems(d: MailingDraft): Partial<Record<"subject" | "body", string>> {
  const out: Partial<Record<"subject" | "body", string>> = {};
  const subject = d.subject.trim();
  if (subject.length < 3 || subject.length > 150) out.subject = "Write a subject of 3 to 150 characters.";
  if (d.body.trim().length < 10) out.body = "Write a message of at least 10 characters.";
  else if (d.body.length > 20_000) out.body = "The message is too long: keep it under 20,000 characters.";
  return out;
}

/** A new key per composed mailing, so a double click or a retry after a lost answer sends once. */
export function newMailingKey(random: () => string = () => globalThis.crypto.randomUUID()): string {
  return `mailing-${random()}`;
}

/** Whether a mailing can still be cancelled (nothing, or not everything, has been sent). */
export const mailingCancellable = (status: MailingStatus) => status === "QUEUED" || status === "SENDING";

export type SubscribersPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

/** What the administrators' screen shows: it waits for the backend and the permissions, then needs both. */
export function subscribersPageMode(opts: {
  detection: BackendDetection | null | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): SubscribersPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!subscribersSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(SUBSCRIBERS_PERMISSION) ? "visible" : "forbidden";
}
