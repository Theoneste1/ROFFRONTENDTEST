/**
 * Teacher application review (`/admin/teacher-applications`): who may see it, what an approval
 * sends and what the backend's refusals mean (unit-tested in tests/teacher-registration.test.mjs).
 *
 * The page and its menu item need BOTH the backend feature `teacherSelfRegistration` and the
 * caller's `users.manageTeachers` (the backend also refuses with TEACHERS_DISABLED while the
 * Teacher role is off).
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { TeacherApplication, TeacherApplicationStatus } from "../api/teacher-registration";
import type { Permission } from "../api/types";

export const TEACHER_APPLICATIONS_PERMISSION: Permission = "users.manageTeachers";

export const TEACHER_APPLICATION_STATUSES: readonly { label: string; value: TeacherApplicationStatus }[] = [
  { label: "Waiting", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

export type TeacherReviewMode = "loading" | "hidden" | "error" | "review";

/**
 * "loading" while the detection or the permission list is still loading; "error" when the backend
 * advertises the feature but the permission list failed to load (not the same as lacking the
 * permission); "review" only when the backend advertises the feature and the caller holds the
 * permission; otherwise "hidden".
 */
export function teacherReviewMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (permission: Permission) => boolean;
}): TeacherReviewMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!hasFeature(opts.detection, "teacherSelfRegistration")) return "hidden";
  if (opts.permissionsStatus === "error") return "error";
  if (!opts.can(TEACHER_APPLICATIONS_PERMISSION)) return "hidden";
  return "review";
}

/** The menu item is shown only for a definite answer: the feature AND the known permission. */
export function teacherApplicationsNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return hasFeature(detection, "teacherSelfRegistration") && !!permissions && permissions.has(TEACHER_APPLICATIONS_PERMISSION);
}

/**
 * A "my school is not listed" application: it names a proposed school. Until an Administrator
 * verifies it (POST …/:id/school) it has no `school`; afterwards `school` is the official one and
 * `schoolVerifiedAt` is set — it stays a missing-school application (the proposed name is kept).
 */
export function isMissingSchoolApplication(app: Pick<TeacherApplication, "school" | "proposedSchoolName">): boolean {
  return !!app.proposedSchoolName || !app.school;
}

/** A missing-school application whose school has not been verified yet (approval must wait). */
export function schoolVerificationNeeded(app: Pick<TeacherApplication, "school" | "proposedSchoolName" | "schoolVerifiedAt">): boolean {
  return isMissingSchoolApplication(app) && !(app.schoolVerifiedAt && app.school);
}

export const SCHOOL_NOT_VERIFIED_REASON = "Verify the applicant's school first. Approval is possible once the school is verified.";

export interface TeacherReviewActions {
  /** "Verify school": a PENDING missing-school application without a verified school. */
  verifySchool: boolean;
  /** "Approve": offered for every PENDING application; disabled (with the reason) until the school is verified. */
  approve: { shown: false } | { shown: true; enabled: true } | { shown: true; enabled: false; reason: string };
  reject: boolean;
}

/**
 * What the Administrator may do with an application. School verification is a separate step
 * from approval: it never approves the teacher, and approval never chooses a school.
 */
export function teacherReviewActions(app: Pick<TeacherApplication, "status" | "school" | "proposedSchoolName" | "schoolVerifiedAt">): TeacherReviewActions {
  if (app.status !== "PENDING") return { verifySchool: false, approve: { shown: false }, reject: false };
  if (schoolVerificationNeeded(app)) {
    return { verifySchool: true, approve: { shown: true, enabled: false, reason: SCHOOL_NOT_VERIFIED_REASON }, reject: true };
  }
  return { verifySchool: false, approve: { shown: true, enabled: true }, reject: true };
}

export const APPROVAL_NOTE_MAX = 500;
export const VERIFY_NOTE_MAX = 500;
export const REJECTION_REASON = { min: 2, max: 500 };

/** The approval body: never a school (the application's own, listed or verified, is used); an optional note. */
export function approvalPayload(note: string): { ok: true; body: { note?: string } } | { ok: false; problem: string } {
  const n = note.trim();
  if (n.length > APPROVAL_NOTE_MAX) return { ok: false, problem: `The note must be at most ${APPROVAL_NOTE_MAX} characters.` };
  return { ok: true, body: n ? { note: n } : {} };
}

/** The school-verification body: the chosen existing official school and an optional note. */
export function verifySchoolPayload(
  chosenSchoolId: string | null,
  note: string,
): { ok: true; body: { schoolId: string; note?: string } } | { ok: false; problem: string } {
  const n = note.trim();
  if (!chosenSchoolId) return { ok: false, problem: "Choose the official school that matches the applicant's school." };
  if (n.length > VERIFY_NOTE_MAX) return { ok: false, problem: `The note must be at most ${VERIFY_NOTE_MAX} characters.` };
  return { ok: true, body: { schoolId: chosenSchoolId, ...(n && { note: n }) } };
}

export function rejectionReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  return n < REJECTION_REASON.min || n > REJECTION_REASON.max ? `Give a reason (${REJECTION_REASON.min}–${REJECTION_REASON.max} characters).` : null;
}

/** Messages for the review routes' error codes. */
export const TEACHER_REVIEW_ERRORS: Readonly<Record<string, string>> = {
  APPLICATION_ALREADY_DECIDED: "This application has already been decided. The list has been refreshed.",
  SCHOOL_ALREADY_VERIFIED: "This application's school has already been verified. The list has been refreshed.",
  SCHOOL_NOT_VERIFIED: "Verify the applicant's school before approving. The list has been refreshed.",
  // Older backends asked for the school at approval time.
  SCHOOL_REQUIRED: "Verify the applicant's school before approving.",
  SCHOOL_MISMATCH: "The school no longer matches this application's school. The list has been refreshed; try again.",
  UNKNOWN_SCHOOL: "That school is not an active school in Rwanda's official directory. Choose another one.",
  TEACHERS_DISABLED: "Teacher accounts are switched off on this server, so applications can't be approved right now.",
  IDENTITY_TAKEN: "Another account or application now uses this username or e-mail, so the application can't be approved.",
};

/** Codes after which the list is stale and should be refreshed. */
export const REFRESH_AFTER: readonly string[] = ["APPLICATION_ALREADY_DECIDED", "SCHOOL_ALREADY_VERIFIED", "SCHOOL_NOT_VERIFIED", "SCHOOL_MISMATCH"];

/** Where an application's school is (a listed school's own place, else the place given). */
export function applicationSchoolPlace(app: Pick<TeacherApplication, "school" | "schoolProvince" | "schoolDistrict" | "schoolSector">): string {
  const s = app.school;
  const parts = s ? [s.sector, s.district, s.province] : [app.schoolSector, app.schoolDistrict, app.schoolProvince];
  return parts.filter(Boolean).join(", ");
}
