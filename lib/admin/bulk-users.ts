/**
 * Bulk user operations in the administrators' Users page (capability bulkUserOperations): who may use them,
 * which actions to offer, the selection (chosen accounts or every account matching the list's filters), the
 * request bodies and the progress labels. Pure; unit-tested in tests/bulk-users.test.mjs.
 *
 * The server is the authority: it re-resolves the selection, binds the confirmation to exactly the previewed
 * accounts (selectionToken → 409 SELECTION_CHANGED), applies each account's role policy and records a result per
 * account. The browser never loads every matching account: "all matching" is sent as the filter itself.
 */
import type {
  BulkAction,
  BulkExecuteInput,
  BulkFilter,
  BulkItemOutcome,
  BulkOperation,
  BulkOperationStatus,
  BulkParams,
  BulkPreview,
  BulkSelection,
} from "../api/bulk-users";
import type { UserFilters } from "../api/admin";
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";

export const BULK_PERMISSION: Permission = "users.bulkManage";
export const EXPORT_PERMISSION: Permission = "users.export";
/** The backend's limit for chosen accounts ({ mode: "ids" }). */
export const MAX_SELECTED = 1000;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

interface ActionMeta {
  label: string;
  /** Permissions needed besides users.bulkManage (the backend's ACTION_RULES). */
  permissions: readonly Permission[];
  danger: boolean;
}

export const BULK_ACTIONS: Readonly<Record<BulkAction, ActionMeta>> = {
  activate: { label: "Activate", permissions: ["users.changeStatus", "users.suspend"], danger: false },
  deactivate: { label: "Deactivate", permissions: ["users.changeStatus"], danger: true },
  suspend: { label: "Suspend", permissions: ["users.suspend"], danger: true },
  archive: { label: "Archive", permissions: ["users.archive"], danger: true },
  restore: { label: "Restore", permissions: ["users.changeStatus", "users.suspend", "users.archive"], danger: false },
  assignRole: { label: "Change role", permissions: [], danger: true },
  changeClassification: { label: "Change grade", permissions: [], danger: false },
  message: { label: "Send an e-mail", permissions: ["email.bulkSend"], danger: false },
  assignTeacher: { label: "Assign to a teacher", permissions: ["users.manageTeachers"], danger: false },
  unassignTeacher: { label: "Remove from a teacher", permissions: ["users.manageTeachers"], danger: false },
  grantDelegation: { label: "Give a teacher a permission for these students", permissions: ["users.manageTeachers"], danger: false },
  revokeDelegation: { label: "Take a teacher's permission back for these students", permissions: ["users.manageTeachers"], danger: false },
};

/** Actions on teacher–student links: only on backends with teacherStudentAccess. */
export const TEACHER_STUDENT_ACTIONS: readonly BulkAction[] = ["assignTeacher", "unassignTeacher", "grantDelegation", "revokeDelegation"];
export const TEACHER_DELEGATION_OPTIONS = [
  { value: "students.viewProfile", label: "View student profiles" },
  { value: "students.viewProgress", label: "View student progress and submissions" },
  { value: "submissions.submitOnBehalf", label: "Submit work on a student's behalf" },
] as const;

export const BULK_ACTION_ORDER: readonly BulkAction[] = [
  "message", "changeClassification", "assignRole", "activate", "deactivate", "suspend", "archive", "restore",
  "assignTeacher", "unassignTeacher", "grantDelegation", "revokeDelegation",
];

/** Bulk actions are offered only with the backend feature and the known users.bulkManage. */
export function bulkAvailable(detection: BackendDetection | null | undefined, can: (p: Permission) => boolean): boolean {
  return hasFeature(detection, "bulkUserOperations") && can(BULK_PERMISSION);
}

export function exportAvailable(detection: BackendDetection | null | undefined, can: (p: Permission) => boolean): boolean {
  return hasFeature(detection, "bulkUserOperations") && can(EXPORT_PERMISSION);
}

/**
 * The actions this administrator may start (every permission the action needs is held). The teacher–student actions
 * also need the backend to offer teacherStudentAccess (`teacherStudentAccess`; false for older backends).
 */
export function allowedActions(can: (p: Permission) => boolean, teacherStudentAccess = false): BulkAction[] {
  return BULK_ACTION_ORDER.filter((a) => (teacherStudentAccess || !TEACHER_STUDENT_ACTIONS.includes(a)) && BULK_ACTIONS[a].permissions.every((p) => can(p)));
}

/** The backend advertises teacherStudentAccess (string check: the feature may be unknown to this build's list). */
export function teacherStudentBulkSupported(detection: BackendDetection | null | undefined): boolean {
  return !!detection && detection.state === "NEW" && (detection.features as readonly string[]).includes("teacherStudentAccess");
}

/** Roles a bulk role change may give: the ones the single-user form offers, never Super Administrator. */
export function bulkRoleOptions(assignable: readonly string[]): string[] {
  return assignable.filter((r) => r !== "SUPER_ADMIN");
}

// ─── Selection ─────────────────────────────────────────────────────────────

/** The list page's filters as a bulk filter: same names and meaning, without paging and empty values. */
export function filterFromListFilters(f: UserFilters): BulkFilter {
  const out: BulkFilter = {};
  if (f.role) out.role = f.role;
  if (f.divisionId) out.divisionId = f.divisionId;
  if (f.gradeLevel) out.gradeLevel = f.gradeLevel;
  if (f.schoolId) out.schoolId = f.schoolId;
  if (typeof f.isApproved === "boolean") out.isApproved = f.isApproved;
  if (typeof f.isActive === "boolean") out.isActive = f.isActive;
  if (typeof f.isActivated === "boolean") out.isActivated = f.isActivated;
  const search = typeof f.search === "string" ? f.search.trim() : "";
  if (search) out.search = search.slice(0, 100);
  return out;
}

export type SelectionChoice = "selected" | "filter";

export function buildSelection(choice: SelectionChoice, selectedIds: ReadonlySet<string>, listFilters: UserFilters): BulkSelection | null {
  if (choice === "selected") {
    const ids = [...selectedIds];
    return ids.length > 0 && ids.length <= MAX_SELECTED ? { mode: "ids", ids } : null;
  }
  return { mode: "filter", filter: filterFromListFilters(listFilters) };
}

/** "every account" when the filter is empty — said explicitly so nobody acts on everyone by accident. */
export function selectionSummary(sel: BulkSelection): string {
  if (sel.mode === "ids") return `${sel.ids.length} selected account${sel.ids.length === 1 ? "" : "s"}`;
  return Object.keys(sel.filter).length === 0 ? "every account on the platform (no filter)" : "every account matching the current filters";
}

/** Toggle one id; refuses to go past MAX_SELECTED. */
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < MAX_SELECTED) next.add(id);
  return next;
}

/** Select or clear the whole current page. */
export function togglePage(selected: ReadonlySet<string>, pageIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  const allOn = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  for (const id of pageIds) {
    if (allOn) next.delete(id);
    else if (next.size < MAX_SELECTED) next.add(id);
  }
  return next;
}

// ─── Parameters and confirmation ───────────────────────────────────────────

export interface ParamsDraft {
  role: string;
  gradeLevel: string;
  subject: string;
  body: string;
  teacherId: string;
  permission: string;
}

export const EMPTY_PARAMS: ParamsDraft = { role: "", gradeLevel: "", subject: "", body: "", teacherId: "", permission: "" };

/** The parameters the action uses, or the problem with them (the backend's limits). */
export function buildParams(action: BulkAction, d: ParamsDraft): { params?: BulkParams; problem?: string } {
  switch (action) {
    case "assignRole":
      if (!d.role) return { problem: "Choose the new role." };
      if (d.role === "SUPER_ADMIN") return { problem: "The Super Administrator role is never assigned in bulk." };
      return { params: { role: d.role as BulkParams["role"] } };
    case "changeClassification":
      return d.gradeLevel ? { params: { gradeLevel: d.gradeLevel as BulkParams["gradeLevel"] } } : { problem: "Choose the new grade." };
    case "message": {
      const subject = d.subject.trim();
      if (subject.length < 2 || subject.length > 200) return { problem: "The subject needs 2–200 characters." };
      if (d.body.trim().length < 5 || d.body.length > 10_000) return { problem: "The message needs 5–10 000 characters." };
      return { params: { subject, body: d.body } };
    }
    case "assignTeacher":
    case "unassignTeacher":
      return d.teacherId ? { params: { teacherId: d.teacherId } } : { problem: "Choose the teacher." };
    case "grantDelegation":
    case "revokeDelegation":
      if (!d.teacherId) return { problem: "Choose the teacher." };
      return d.permission ? { params: { teacherId: d.teacherId, permission: d.permission } } : { problem: "Choose the permission." };
    default:
      return {};
  }
}

export interface ConfirmDraft {
  reason: string;
  currentPassword: string;
  acknowledged: boolean;
}

/** What still blocks Execute after a preview. */
export function confirmProblems(p: Pick<BulkPreview, "total" | "requiresReason" | "requiresStepUp">, d: ConfirmDraft): string[] {
  const out: string[] = [];
  if (p.total === 0) out.push("No account matches the selection.");
  const reason = d.reason.trim();
  if (p.requiresReason && (reason.length < REASON_MIN || reason.length > REASON_MAX)) out.push(`Give a reason (${REASON_MIN}–${REASON_MAX} characters).`);
  if (!p.requiresReason && reason.length > REASON_MAX) out.push(`The reason may have at most ${REASON_MAX} characters.`);
  if (p.requiresStepUp && !d.currentPassword) out.push("Enter your current password: the change involves Administrator roles.");
  if (!d.acknowledged) out.push(`Confirm that you want to apply this to ${p.total} account${p.total === 1 ? "" : "s"}.`);
  return out;
}

/** The execute body for exactly the previewed request. */
export function executeBody(p: BulkPreview, d: ConfirmDraft, idempotencyKey: string): BulkExecuteInput {
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

/** A new idempotency key for one confirmation (re-used if the same confirmation is retried). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `bulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A known refusal as a readable message (null = the generic message). `previewAgain` = the preview is stale. */
export function bulkErrorMessage(e: { status?: number; code?: string; message?: string } | null | undefined): { text: string; previewAgain: boolean } | null {
  if (!e) return null;
  switch (e.code) {
    case "SELECTION_CHANGED":
      return { text: "The selected accounts changed since the preview. Preview again and confirm the new selection.", previewAgain: true };
    case "EMPTY_SELECTION":
      return { text: "No account matches the selection any more.", previewAgain: true };
    case "SELECTION_TOO_LARGE":
      return { text: e.message ?? "The selection is too large. Narrow the filters.", previewAgain: false };
    case "ROLE_NOT_ALLOWED_IN_BULK":
      return { text: "The Super Administrator role is never assigned in bulk.", previewAgain: false };
    case "STEP_UP_REQUIRED":
    case "INVALID_CURRENT_PASSWORD":
    case "INVALID_PASSWORD":
      return { text: "Your current password was not accepted.", previewAgain: false };
    case "REASON_REQUIRED":
      return { text: e.message ?? "Give a reason.", previewAgain: false };
    case "PERMISSION_REQUIRED":
      return { text: "You don't have permission for this action.", previewAgain: false };
    case "BULK_BUSY":
      return { text: "The accounts are busy. Try again in a moment.", previewAgain: false };
    case "OPERATION_FINISHED":
      return { text: "This operation has already finished.", previewAgain: false };
    default:
      return null;
  }
}

// ─── Progress ──────────────────────────────────────────────────────────────

export const OPERATION_STATUS_META: Readonly<Record<BulkOperationStatus, { label: string; badge: string; final: boolean }>> = {
  PENDING: { label: "Waiting", badge: "bg-slate-100 text-slate-700", final: false },
  RUNNING: { label: "Running", badge: "bg-blue-50 text-blue-700", final: false },
  CANCELLING: { label: "Cancelling", badge: "bg-amber-50 text-amber-700", final: false },
  COMPLETED: { label: "Completed", badge: "bg-emerald-50 text-emerald-700", final: true },
  COMPLETED_WITH_FAILURES: { label: "Completed with failures", badge: "bg-amber-50 text-amber-800", final: true },
  FAILED: { label: "Failed", badge: "bg-red-50 text-red-700", final: true },
  CANCELLED: { label: "Cancelled", badge: "bg-slate-100 text-slate-600", final: true },
};

export function operationStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(OPERATION_STATUS_META, s) ? OPERATION_STATUS_META[s as BulkOperationStatus].label : s;
}

/** Still changing: poll it. */
export function isOperationActive(op: Pick<BulkOperation, "status">): boolean {
  const m = OPERATION_STATUS_META[op.status as BulkOperationStatus];
  return m ? !m.final : false;
}

export function canCancel(op: Pick<BulkOperation, "status">): boolean {
  return op.status === "PENDING" || op.status === "RUNNING";
}

/** Percentage processed (0–100). */
export function progressPercent(op: Pick<BulkOperation, "total" | "succeeded" | "failed" | "skipped">): number {
  if (op.total <= 0) return 100;
  return Math.min(100, Math.round(((op.succeeded + op.failed + op.skipped) / op.total) * 100));
}

export function actionLabel(action: string): string {
  return Object.prototype.hasOwnProperty.call(BULK_ACTIONS, action) ? BULK_ACTIONS[action as BulkAction].label : action;
}

export const ITEM_OUTCOME_FILTERS: readonly { label: string; value: BulkItemOutcome | "" }[] = [
  { label: "All", value: "" },
  { label: "Failed", value: "FAILED" },
  { label: "Skipped", value: "SKIPPED" },
  { label: "Succeeded", value: "SUCCEEDED" },
  { label: "Waiting", value: "PENDING" },
];

const ITEM_CODES: Readonly<Record<string, string>> = {
  ALREADY_IN_STATE: "Already in that state",
  USE_RESTORE: "Archived: use Restore",
  NOT_APPLICABLE: "Not applicable to this account's state",
  CANCELLED: "Operation cancelled",
  SELF: "Your own account",
  ALREADY_IN_ROLE: "Already has this role",
  NOT_STUDENT: "Not a student",
  NOT_ACTIVE: "Account not active",
};

export function itemCodeLabel(code: string | null): string {
  if (!code) return "";
  return ITEM_CODES[code] ?? code;
}
