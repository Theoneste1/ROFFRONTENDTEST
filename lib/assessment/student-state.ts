/**
 * Student assignment states and submission errors, derived only from backend data
 * (backend develop 9fd1942 and main a8df186 behave the same for students).
 *
 * The backend gives five `displayStatus` labels: Not Started, Submitted,
 * Pending Review, Resubmission Requested, Reviewed (= result published, i.e.
 * graded). It has no "overdue" label; that is derived here from the fields it
 * does return:
 *   overdue      Not Started, `canSubmit` false, and the deadline has passed or the
 *                assignment is CLOSED — the backend will refuse a submission
 *   lateAllowed  Not Started, `canSubmit` true, deadline passed (allowLateSubmission):
 *                a submission is still accepted and marked late
 * `canSubmit` is the backend's own answer and always wins.
 */
import { isApiError } from "../api/errors";
import type { StudentAssignment } from "../api/types";

export type AssignmentTiming = "overdue" | "lateAllowed" | null;

export function assignmentTiming(a: Pick<StudentAssignment, "displayStatus" | "canSubmit" | "deadline" | "status">, now: number): AssignmentTiming {
  if (a.displayStatus !== "Not Started") return null;
  const past = now > new Date(a.deadline).getTime();
  if (!a.canSubmit && (past || a.status === "CLOSED")) return "overdue";
  if (a.canSubmit && past) return "lateAllowed";
  return null;
}

/** The list's status filter: the backend labels plus the derived "Overdue". */
export type StudentStatusFilter = "all" | StudentAssignment["displayStatus"] | "Overdue";

export function matchesStatusFilter(a: StudentAssignment, filter: StudentStatusFilter, now: number): boolean {
  if (filter === "all") return true;
  if (filter === "Overdue") return assignmentTiming(a, now) === "overdue";
  return a.displayStatus === filter;
}

/** Plain messages for `POST /submissions` refusals (codes from SubmissionsService and the upload layer). */
const SUBMIT_ERRORS: Readonly<Record<string, string>> = {
  ANSWER_REQUIRED: "Type an answer or attach at least one file.",
  ASSIGNMENT_CLOSED: "This assignment is closed and no longer accepts submissions.",
  DEADLINE_PASSED: "The deadline has passed, so this work can't be submitted or replaced any more.",
  RESUBMISSION_NOT_ALLOWED: "This assignment doesn't allow resubmissions.",
  RESUBMISSION_LIMIT_REACHED: "You have used all the resubmissions allowed for this assignment.",
  RESUBMISSION_WINDOW_CLOSED: "The time your coach gave for the resubmission has passed. Contact your coach.",
  INVALID_STATE_TRANSITION: "Your work is already being reviewed, or it changed while uploading. The page has been refreshed.",
  ALREADY_SUBMITTED: "This work was already submitted (perhaps in another tab). The page has been refreshed.",
  FILE_TOO_LARGE: "A file is larger than 20 MB. Make it smaller (e.g. compress the PDF or photo) and try again.",
  FILE_TYPE_NOT_ALLOWED: "One of the files isn't an accepted type. Accepted: PDF, images (incl. HEIC), Word, ZIP or plain text.",
  EMPTY_FILE: "One of the files is empty. Choose the file again.",
  TOO_MANY_FILES: "You can attach up to 10 files.",
  UPLOAD_REJECTED: "The upload was refused. Attach at most 10 files and try again.",
  PERMISSION_REQUIRED: "Your account isn't allowed to submit work. Contact an administrator.",
  FORBIDDEN: "Your account isn't allowed to submit work. Contact an administrator.",
};

/** Codes after which the assignment's state on screen is stale (refetch it). */
const STATE_CODES = new Set(["ASSIGNMENT_CLOSED", "DEADLINE_PASSED", "RESUBMISSION_LIMIT_REACHED", "RESUBMISSION_WINDOW_CLOSED", "INVALID_STATE_TRANSITION", "ALREADY_SUBMITTED", "RESUBMISSION_NOT_ALLOWED"]);

export function submitErrorMessage(error: unknown): string | null {
  if (!isApiError(error)) return null;
  if (error.code && SUBMIT_ERRORS[error.code]) return SUBMIT_ERRORS[error.code];
  if (error.status === 413) return SUBMIT_ERRORS.FILE_TOO_LARGE;
  if (error.status === 415) return SUBMIT_ERRORS.FILE_TYPE_NOT_ALLOWED;
  return null;
}

export function submitErrorStale(error: unknown): boolean {
  return isApiError(error) && !!error.code && STATE_CODES.has(error.code);
}

/** Why a student list or page is refused, or null for other errors (shown with retry). */
export function studentAccessDenied(error: unknown): { title: string; body: string } | null {
  if (!isApiError(error) || error.status !== 403) return null;
  if (error.code === "NO_DIVISION") {
    return { title: "Your account has no division yet", body: "Assignments are given by division (Junior S1–S3 or Senior S4–S6). An administrator needs to set your grade first." };
  }
  return { title: "Not available to your account", body: "Your account isn't allowed to see this. Contact an administrator if you think this is a mistake." };
}
