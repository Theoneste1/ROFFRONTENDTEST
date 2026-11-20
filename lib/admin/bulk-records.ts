/**
 * Bulk actions on any record type (capability bulkOperationsGeneric): which record types this page offers, their
 * names and action labels, the selection (chosen records or every record matching the list's filters), the
 * confirmation rules, the execute body and how a record is summarised in previews and results. Pure; unit-tested in
 * tests/bulk-records.test.mjs.
 *
 * The server is the authority: GET /admin/bulk/actions says which actions this administrator may run (with whether a
 * reason is required and the consequence); the confirmation is bound to exactly the previewed records, and every
 * record is checked with the same rules as a single change.
 */
import type { BackendDetection } from "../api/capabilities";
import { hasFeature } from "../api/capabilities";
import type { Permission } from "../api/types";
import type { BulkActionsView, BulkEntityTypeInfo, RecordExecuteInput, RecordItem, RecordPreview, RecordSelection } from "../api/bulk";

export const GATE_PERMISSION: Permission = "users.bulkManage";
export const REASON_MIN = 3;
export const REASON_MAX = 500;
/** The default limit for chosen records (the server's maxIds for the type wins when known). */
export const DEFAULT_MAX_IDS = 1000;

export interface RecordTypeMeta {
  /** "school" / "schools". */
  singular: string;
  plural: string;
  /** Key of the record's summary on an item (the backend handler's itemKey). */
  itemKey: string;
  actions: Readonly<Record<string, { label: string; danger?: boolean }>>;
}

export const RECORD_TYPES: Readonly<Record<string, RecordTypeMeta>> = {
  USER: {
    singular: "account", plural: "accounts", itemKey: "user",
    actions: {
      activate: { label: "Activate" }, deactivate: { label: "Deactivate", danger: true }, suspend: { label: "Suspend", danger: true },
      archive: { label: "Archive", danger: true }, restore: { label: "Restore" }, assignRole: { label: "Change role", danger: true },
      changeClassification: { label: "Change grade" }, message: { label: "Send an e-mail" },
      assignTeacher: { label: "Assign to a teacher" }, unassignTeacher: { label: "Remove from a teacher" },
      grantDelegation: { label: "Give a teacher a permission" }, revokeDelegation: { label: "Take a teacher's permission back" },
    },
  },
  SCHOOL: {
    singular: "school", plural: "schools", itemKey: "school",
    actions: { activate: { label: "Activate" }, deactivate: { label: "Deactivate", danger: true }, verify: { label: "Mark as verified" } },
  },
  SCHOOL_AFFILIATION: {
    singular: "school claim", plural: "school claims", itemKey: "affiliation",
    actions: { verify: { label: "Verify" }, reject: { label: "Reject", danger: true } },
  },
  TEACHER_APPLICATION: {
    singular: "teacher application", plural: "teacher applications", itemKey: "application",
    actions: { reject: { label: "Reject", danger: true } },
  },
  COACH_APPLICATION: {
    singular: "coach application", plural: "coach applications", itemKey: "application",
    actions: { approve: { label: "Approve" }, reject: { label: "Reject", danger: true } },
  },
  ASSIGNMENT: {
    singular: "assignment", plural: "assignments", itemKey: "assignment",
    actions: { publish: { label: "Publish" }, close: { label: "Close" }, archive: { label: "Archive", danger: true } },
  },
};

const humanise = (s: string) => s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function recordTypeMeta(entityType: string): RecordTypeMeta {
  return Object.prototype.hasOwnProperty.call(RECORD_TYPES, entityType)
    ? RECORD_TYPES[entityType]
    : { singular: "record", plural: "records", itemKey: "", actions: {} };
}

/** "3 schools", "1 school claim". */
export function countNoun(entityType: string, n: number): string {
  const m = recordTypeMeta(entityType);
  return `${n} ${n === 1 ? m.singular : m.plural}`;
}

/** The label of a record type's action; unknown actions read as words. */
export function recordActionLabel(entityType: string, action: string): string {
  const a = recordTypeMeta(entityType).actions[action];
  if (a) return a.label;
  const h = humanise(action);
  return h.charAt(0).toUpperCase() + h.slice(1);
}

export function recordActionDanger(entityType: string, action: string): boolean {
  return !!recordTypeMeta(entityType).actions[action]?.danger;
}

/** "Schools", "Teacher applications" (filter pills on the operations page). */
export function recordTypeLabel(entityType: string): string {
  const p = recordTypeMeta(entityType).plural;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ─── Availability ──────────────────────────────────────────────────────────

/** The generic bulk routes exist and the gate permission is held (the actions list then says what is allowed). */
export function genericBulkAvailable(detection: BackendDetection | null | undefined, can: (p: Permission) => boolean): boolean {
  return hasFeature(detection, "bulkOperationsGeneric") && can(GATE_PERMISSION);
}

/** The record type as the server offers it to this administrator, or null (unknown type, or no allowed action). */
export function entityTypeInfo(view: BulkActionsView | null | undefined, entityType: string): BulkEntityTypeInfo | null {
  const t = view?.entityTypes.find((e) => e.entityType === entityType);
  return t && t.actions.length > 0 ? t : null;
}

// ─── Selection ─────────────────────────────────────────────────────────────

const PAGING = new Set(["page", "limit", "sort", "order"]);

/** A list page's filters as a bulk filter: same names and meaning, without paging, sorting and empty values. */
export function bulkFilterFrom(listFilters: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(listFilters)) {
    if (PAGING.has(k) || v === undefined || v === null) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) out[k] = t;
    } else out[k] = v;
  }
  return out;
}

/** Toggle one id; refuses to go past `max`. */
export function toggleRecord(selected: ReadonlySet<string>, id: string, max = DEFAULT_MAX_IDS): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < max) next.add(id);
  return next;
}

/** Select or clear the whole current page. */
export function toggleRecordPage(selected: ReadonlySet<string>, pageIds: readonly string[], max = DEFAULT_MAX_IDS): Set<string> {
  const next = new Set(selected);
  const allOn = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  for (const id of pageIds) {
    if (allOn) next.delete(id);
    else if (next.size < max) next.add(id);
  }
  return next;
}

export function idsSelection(selected: ReadonlySet<string>, max = DEFAULT_MAX_IDS): RecordSelection | null {
  const ids = [...selected];
  return ids.length > 0 && ids.length <= max ? { mode: "ids", ids } : null;
}

/** Said explicitly when the filter is empty, so nobody acts on every record by accident. */
export function recordSelectionSummary(entityType: string, sel: RecordSelection): string {
  const m = recordTypeMeta(entityType);
  if (sel.mode === "ids") return `${sel.ids.length} selected ${sel.ids.length === 1 ? m.singular : m.plural}`;
  return Object.keys(sel.filter).length === 0 ? `every ${m.singular} (no filter)` : `every ${m.singular} matching the current filters`;
}

// ─── Confirmation ──────────────────────────────────────────────────────────

export interface RecordConfirmDraft {
  reason: string;
  currentPassword: string;
  acknowledged: boolean;
}

export const EMPTY_CONFIRM: RecordConfirmDraft = { reason: "", currentPassword: "", acknowledged: false };

/** What still blocks Apply after a preview. */
export function recordConfirmProblems(p: Pick<RecordPreview, "entityType" | "total" | "requiresReason" | "requiresStepUp">, d: RecordConfirmDraft): string[] {
  const m = recordTypeMeta(p.entityType);
  const out: string[] = [];
  if (p.total === 0) out.push(`No ${m.singular} matches the selection.`);
  const reason = d.reason.trim();
  if (p.requiresReason && (reason.length < REASON_MIN || reason.length > REASON_MAX)) out.push(`Give a reason (${REASON_MIN}–${REASON_MAX} characters).`);
  if (!p.requiresReason && reason.length > REASON_MAX) out.push(`The reason may have at most ${REASON_MAX} characters.`);
  if (p.requiresStepUp && !d.currentPassword) out.push("Enter your current password.");
  if (!d.acknowledged) out.push(`Confirm that you want to apply this to ${countNoun(p.entityType, p.total)}.`);
  return out;
}

/** The execute body for exactly the previewed request. */
export function recordExecuteBody(p: RecordPreview, d: RecordConfirmDraft, idempotencyKey: string): RecordExecuteInput {
  const reason = d.reason.trim();
  return {
    action: p.action,
    ...(p.params && Object.keys(p.params).length > 0 && { params: p.params }),
    selection: p.selection,
    selectionToken: p.selectionToken,
    expectedTotal: p.total,
    confirm: true,
    idempotencyKey,
    ...(reason && { reason }),
    ...(p.requiresStepUp && d.currentPassword && { currentPassword: d.currentPassword }),
  };
}

/** A known refusal as a readable message (null = the generic message). `previewAgain` = the preview is stale. */
export function recordBulkError(entityType: string, e: { status?: number; code?: string; message?: string } | null | undefined): { text: string; previewAgain: boolean } | null {
  if (!e) return null;
  const m = recordTypeMeta(entityType);
  switch (e.code) {
    case "SELECTION_CHANGED":
      return { text: `The selected ${m.plural} changed since the preview. Preview again and confirm the new selection.`, previewAgain: true };
    case "EMPTY_SELECTION":
      return { text: `No ${m.singular} matches the selection any more.`, previewAgain: true };
    case "CONFIRMATION_EXPIRED":
      return { text: "The preview is more than 15 minutes old. Preview again.", previewAgain: true };
    case "CONFIRMATION_USED":
      return { text: "This preview has already been applied. Preview again to start another operation.", previewAgain: true };
    case "SELECTION_TOO_LARGE":
      return { text: e.message ?? "The selection is too large. Narrow the filters.", previewAgain: false };
    case "INVALID_CURRENT_PASSWORD":
    case "INVALID_PASSWORD":
    case "STEP_UP_REQUIRED":
      return { text: "Your current password was not accepted.", previewAgain: false };
    case "REASON_REQUIRED":
      return { text: e.message ?? "Give a reason.", previewAgain: false };
    case "PERMISSION_REQUIRED":
    case "FORBIDDEN":
      return { text: "You don't have permission for this action.", previewAgain: false };
    case "BULK_BUSY":
      return { text: `The ${m.plural} are busy. Try again in a moment.`, previewAgain: false };
    case "OPERATION_FINISHED":
      return { text: "This operation has already finished.", previewAgain: false };
    default:
      return null;
  }
}

// ─── Record summaries (previews and results) ───────────────────────────────

export interface RecordSummary {
  title: string;
  detail: string;
  href: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const person = (o: Obj | null) => (o ? `${str(o.firstName)} ${str(o.lastName)}`.trim() : "");
const at = (o: Obj | null) => (o && str(o.username) ? `@${str(o.username)}` : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

/** One record as the preview's sample or an item's summary shows it (and where it opens). */
export function recordSummary(entityType: string, record: unknown): RecordSummary | null {
  const r = obj(record);
  if (!r) return null;
  const id = str(r.id);
  switch (entityType) {
    case "USER":
      return { title: `${person(r)} ${at(r)}`.trim(), detail: join(str(r.role).toLowerCase().replace(/_/g, " "), str(r.accountStatus).toLowerCase()), href: id ? `/admin/users/${id}` : null };
    case "SCHOOL":
      return {
        title: str(r.name),
        detail: join(str(r.code) ? `code ${str(r.code)}` : "", str(r.district), str(r.countryCode), r.isActive === false ? "inactive" : r.isActive === true ? "active" : ""),
        href: id ? `/admin/schools/${id}` : null,
      };
    case "SCHOOL_AFFILIATION": {
      const student = obj(r.student);
      const school = obj(r.school);
      return {
        title: `${person(student)} ${at(student)}`.trim(),
        detail: join(school ? str(school.name) : str(r.claimedName) ? `“${str(r.claimedName)}” (not matched)` : "", str(r.status).toLowerCase()),
        href: student && str(student.id) ? `/admin/users/${str(student.id)}` : null,
      };
    }
    case "TEACHER_APPLICATION": {
      const school = obj(r.school);
      return {
        title: `${person(r)} ${at(r)}`.trim(),
        detail: join(school ? str(school.name) : str(r.proposedSchoolName), str(r.status).toLowerCase()),
        href: null,
      };
    }
    case "COACH_APPLICATION":
      return { title: `${person(r)} ${at(r)}`.trim(), detail: join(str(r.email), str(r.status).toLowerCase()), href: null };
    case "ASSIGNMENT": {
      const course = obj(r.course);
      const division = obj(r.division);
      return {
        title: str(r.title),
        detail: join(course ? str(course.title) : "", division ? str(division.name) : "", str(r.status).toLowerCase().replace(/_/g, " ")),
        href: id ? `/admin/assignments/${id}` : null,
      };
    }
    default:
      return { title: str(r.name) || person(r) || id, detail: "", href: null };
  }
}

/** The record summarised on an item (under the type's key). */
export function itemSummary(entityType: string, item: RecordItem): RecordSummary | null {
  const key = recordTypeMeta(entityType).itemKey;
  return key ? recordSummary(entityType, item[key]) : null;
}

const ITEM_CODES: Readonly<Record<string, string>> = {
  ALREADY_IN_STATE: "Already in that state",
  ALREADY_DECIDED: "Already decided",
  AFFILIATION_SUPERSEDED: "Replaced by a newer claim",
  NOT_FOUND: "No longer exists",
  NOT_APPLICABLE: "Not applicable in its current state",
  CANCELLED: "Operation cancelled",
  SELF: "Your own account",
  USE_RESTORE: "Archived: use Restore",
  ALREADY_IN_ROLE: "Already has this role",
  NOT_STUDENT: "Not a student",
  NOT_ACTIVE: "Account not active",
  SCHOOL_INACTIVE: "The school is inactive",
  SCHOOL_REQUIRED: "Not matched to a school",
  AFFILIATION_SCHOOL_REQUIRED: "Not matched to a school",
  USERNAME_TAKEN: "Username already in use",
  EMAIL_TAKEN: "E-mail already in use",
};

export function recordItemCodeLabel(code: string | null): string {
  if (!code) return "";
  return ITEM_CODES[code] ?? humanise(code);
}
