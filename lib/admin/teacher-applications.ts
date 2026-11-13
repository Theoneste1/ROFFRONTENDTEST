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

export type TeacherReviewMode = "loading" | "hidden" | "review";

/**
 * "loading" while the detection or the permission list is still loading; "review" only when
 * the backend advertises the feature and the caller holds the permission; otherwise "hidden".
 */
export function teacherReviewMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (permission: Permission) => boolean;
}): TeacherReviewMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!hasFeature(opts.detection, "teacherSelfRegistration")) return "hidden";
  if (opts.permissionsStatus !== "ready" || !opts.can(TEACHER_APPLICATIONS_PERMISSION)) return "hidden";
  return "review";
}

/** The menu item is shown only for a definite answer: the feature AND the known permission. */
export function teacherApplicationsNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return hasFeature(detection, "teacherSelfRegistration") && !!permissions && permissions.has(TEACHER_APPLICATIONS_PERMISSION);
}

/** A missing-school application needs the Administrator to choose an official school. */
export function approvalNeedsSchool(app: Pick<TeacherApplication, "school">): boolean {
  return !app.school;
}

export const APPROVAL_NOTE_MAX = 500;
export const REJECTION_REASON = { min: 2, max: 500 };

/** The approval body: a listed school is the applicant's own (schoolId omitted); a missing school needs one chosen. */
export function approvalPayload(
  app: Pick<TeacherApplication, "school">,
  chosenSchoolId: string | null,
  note: string,
): { ok: true; body: { schoolId?: string; note?: string } } | { ok: false; problem: string } {
  const n = note.trim();
  if (n.length > APPROVAL_NOTE_MAX) return { ok: false, problem: `The note must be at most ${APPROVAL_NOTE_MAX} characters.` };
  if (approvalNeedsSchool(app) && !chosenSchoolId) return { ok: false, problem: "Choose the official school to assign this teacher to." };
  return { ok: true, body: { ...(approvalNeedsSchool(app) && { schoolId: chosenSchoolId! }), ...(n && { note: n }) } };
}

export function rejectionReasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  return n < REJECTION_REASON.min || n > REJECTION_REASON.max ? `Give a reason (${REJECTION_REASON.min}–${REJECTION_REASON.max} characters).` : null;
}

/** Messages for the review routes' error codes. */
export const TEACHER_REVIEW_ERRORS: Readonly<Record<string, string>> = {
  APPLICATION_ALREADY_DECIDED: "This application has already been decided. The list has been refreshed.",
  SCHOOL_REQUIRED: "Choose the official school to assign this teacher to.",
  SCHOOL_MISMATCH: "This application already names a school; approve it with that school.",
  UNKNOWN_SCHOOL: "That school is no longer active in the directory. Choose another one.",
  TEACHERS_DISABLED: "Teacher accounts are switched off on this server, so applications can't be approved right now.",
  IDENTITY_TAKEN: "Another account or application now uses this username or e-mail, so the application can't be approved.",
};

/** Codes after which the list is stale and should be refreshed. */
export const REFRESH_AFTER: readonly string[] = ["APPLICATION_ALREADY_DECIDED"];

/** Where an application's school is (a listed school's own place, else the place given). */
export function applicationSchoolPlace(app: Pick<TeacherApplication, "school" | "schoolProvince" | "schoolDistrict" | "schoolSector">): string {
  const s = app.school;
  const parts = s ? [s.sector, s.district, s.province] : [app.schoolSector, app.schoolDistrict, app.schoolProvince];
  return parts.filter(Boolean).join(", ");
}
