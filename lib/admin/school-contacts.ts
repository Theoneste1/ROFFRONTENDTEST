/**
 * School contacts and offerings (backend src/schools/directory/**): pure rules for the school
 * page's Contacts and Offerings tabs (unit-tested in tests/school-contacts.test.mjs).
 *
 * PUT /contacts sends the school's COMPLETE list of active contacts: one left out is removed
 * (kept as removed); a changed type or value replaces the contact (the new one is unverified and
 * visible to administrators only); a changed label or primary flag keeps its verification.
 */
import { errorMessage, isApiError } from "../api/errors";
import type {
  ContactInput,
  PutSchoolContactsInput,
  PutSchoolOfferingsInput,
  SchoolContact,
  SchoolContactType,
  SchoolContactVisibility,
  VerifySchoolContactInput,
} from "../api/school-directory";

export const MAX_CONTACTS = 20;
export const MAX_PROGRAMMES = 100;
export const REASON = { min: 3, max: 500 };

export const CONTACT_TYPE_LABEL: Record<SchoolContactType, string> = { EMAIL: "E-mail", PHONE: "Phone", OTHER: "Other" };
export const VISIBILITY_LABEL: Record<SchoolContactVisibility, string> = {
  ADMIN_ONLY: "Administrators only",
  REPRESENTATIVES: "Also the school's representatives",
};

/** One row of the contacts editor. `id` is set for an existing contact. */
export interface ContactDraft {
  key: string;
  id: string | null;
  type: SchoolContactType;
  value: string;
  label: string;
  isPrimary: boolean;
}

let seq = 0;
export const newDraftKey = () => `new-${++seq}`;

export function draftsFromContacts(contacts: readonly SchoolContact[]): ContactDraft[] {
  return contacts
    .filter((c) => !c.removedAt)
    .map((c) => ({ key: c.id, id: c.id, type: c.type, value: c.value, label: c.label ?? "", isPrimary: c.isPrimary }));
}

export const emptyDraft = (type: SchoolContactType = "EMAIL"): ContactDraft => ({ key: newDraftKey(), id: null, type, value: "", label: "", isPrimary: false });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /\p{Cc}/u;

/** Rwanda 07XXXXXXXX / +2507XXXXXXXX, or an international +number (the backend normalises and decides). */
export function looksLikePhone(v: string): boolean {
  const digits = v.replace(/[\s().-]/g, "");
  return /^(\+\d{8,15}|0\d{9}|\d{9,12})$/.test(digits);
}

/** Problems per draft key, and for the whole list. */
export function validateContactDrafts(drafts: readonly ContactDraft[]): { rows: Record<string, string>; list: string | null } {
  const rows: Record<string, string> = {};
  const seen = new Map<string, string>();
  const primaries = new Map<SchoolContactType, number>();
  for (const d of drafts) {
    const v = d.value.trim();
    let p: string | null = null;
    if (!v) p = "Enter a value or remove the row.";
    else if (v.length > 200) p = "At most 200 characters.";
    else if (CONTROL.test(v)) p = "Remove control characters.";
    else if (d.type === "EMAIL" && !EMAIL.test(v)) p = "Not an e-mail address.";
    else if (d.type === "PHONE" && !looksLikePhone(v)) p = "Not a phone number (Rwanda: 07XXXXXXXX or +2507XXXXXXXX; elsewhere: +country number).";
    else if (d.label.trim().length > 100) p = "The label is at most 100 characters.";
    if (!p) {
      const k = `${d.type}|${d.type === "EMAIL" ? v.toLowerCase() : v.replace(/\s+/g, "")}`;
      if (seen.has(k)) p = "This contact is listed twice.";
      else seen.set(k, d.key);
    }
    if (p) rows[d.key] = p;
    if (d.isPrimary) primaries.set(d.type, (primaries.get(d.type) ?? 0) + 1);
  }
  const multi = [...primaries].filter(([, n]) => n > 1).map(([t]) => CONTACT_TYPE_LABEL[t].toLowerCase());
  const list = drafts.length > MAX_CONTACTS
    ? `At most ${MAX_CONTACTS} contacts.`
    : multi.length ? `At most one primary contact per type (${multi.join(", ")}).` : null;
  return { rows, list };
}

export function reasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (!r) return null;
  return r.length < REASON.min || r.length > REASON.max ? `The reason must be ${REASON.min}–${REASON.max} characters.` : null;
}

/** `PUT /admin/schools/:id/contacts` body: the whole list; ids only for existing contacts; empty labels left out. */
export function contactsPayload(drafts: readonly ContactDraft[], reason: string): PutSchoolContactsInput {
  const contacts: ContactInput[] = drafts.map((d) => {
    const c: ContactInput = { type: d.type, value: d.value.trim() };
    if (d.id) c.id = d.id;
    if (d.label.trim()) c.label = d.label.trim();
    if (d.isPrimary) c.isPrimary = true;
    return c;
  });
  const out: PutSchoolContactsInput = { contacts };
  if (reason.trim()) out.reason = reason.trim();
  return out;
}

/** What saving will do, so the administrator sees it before confirming. */
export function contactChanges(original: readonly SchoolContact[], drafts: readonly ContactDraft[]) {
  const active = original.filter((c) => !c.removedAt);
  const byId = new Map(active.map((c) => [c.id, c]));
  const kept = new Set(drafts.flatMap((d) => (d.id ? [d.id] : [])));
  const removed = active.filter((c) => !kept.has(c.id));
  const added = drafts.filter((d) => !d.id);
  const replaced: SchoolContact[] = [];
  const edited: SchoolContact[] = [];
  for (const d of drafts) {
    const before = d.id ? byId.get(d.id) : undefined;
    if (!before) continue;
    if (before.type !== d.type || before.value !== d.value.trim()) replaced.push(before);
    else if ((before.label ?? "") !== d.label.trim() || before.isPrimary !== d.isPrimary) edited.push(before);
  }
  /** Verified contacts whose verification ends (replaced or removed). */
  const verificationLost = [...replaced, ...removed].filter((c) => c.verifiedAt);
  return { added: added.length, removed: removed.length, replaced: replaced.length, edited: edited.length, verificationLost: verificationLost.length,
    changed: added.length + removed.length + replaced.length + edited.length > 0 };
}

export function verifyPayload(visibility: SchoolContactVisibility, reason: string): VerifySchoolContactInput {
  const out: VerifySchoolContactInput = { visibility };
  if (reason.trim()) out.reason = reason.trim();
  return out;
}

/** Maps a refused save (`INVALID_CONTACTS` lists its problems). */
export function contactsErrorMessage(err: unknown): string {
  if (isApiError(err) && (err.code === "INVALID_CONTACTS" || err.code === "INVALID_OFFERINGS")) {
    const problems = (err.details as { problems?: unknown } | undefined)?.problems;
    if (Array.isArray(problems) && problems.length) return problems.filter((p) => typeof p === "string").join(" ");
  }
  if (isApiError(err) && err.status === 404) return "This contact or school no longer exists. Refresh the page.";
  return errorMessage(err);
}

// ─── Offerings ──────────────────────────────────────────────────────────────

export interface OfferingsDraft {
  /** level code → qualifier ("" = none). */
  levels: Record<string, string>;
  programmeIds: string[];
}

export function draftFromOfferings(o: { levels: ReadonlyArray<{ code: string; qualifier: string | null }>; programmes: ReadonlyArray<{ id: string }> }): OfferingsDraft {
  return { levels: Object.fromEntries(o.levels.map((l) => [l.code, l.qualifier ?? ""])), programmeIds: o.programmes.map((p) => p.id) };
}

/** `PUT /admin/schools/:id/offerings` body, in the reference-data order of the levels. */
export function offeringsPayload(draft: OfferingsDraft, levelOrder: readonly string[], reason: string): PutSchoolOfferingsInput {
  const codes = Object.keys(draft.levels).sort((a, b) => {
    const ia = levelOrder.indexOf(a);
    const ib = levelOrder.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
  });
  const out: PutSchoolOfferingsInput = {
    levels: codes.map((code) => (draft.levels[code].trim() ? { code, qualifier: draft.levels[code].trim() } : { code })),
    programmes: [...new Set(draft.programmeIds)].map((id) => ({ id })),
  };
  if (reason.trim()) out.reason = reason.trim();
  return out;
}

export function offeringsProblem(draft: OfferingsDraft): string | null {
  if (Object.keys(draft.levels).length > 10) return "At most 10 education levels.";
  if (new Set(draft.programmeIds).size > MAX_PROGRAMMES) return `At most ${MAX_PROGRAMMES} programmes.`;
  for (const [code, q] of Object.entries(draft.levels)) {
    if (q.trim().length > 20) return `The qualifier of ${code} is at most 20 characters.`;
  }
  return null;
}
