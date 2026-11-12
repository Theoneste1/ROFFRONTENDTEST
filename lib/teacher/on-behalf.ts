/**
 * Whether a teacher's "submit on behalf" action is worth offering for one
 * assignment of `GET /teacher/students/:id/progress`. It mirrors only the
 * backend checks (backend `SubmissionsService.submit`, develop 9fd1942) that
 * can be decided from fields the progress response returns:
 *
 *   no submission yet           assignment CLOSED → refused; deadline passed and
 *                               late submission not allowed → refused
 *   resubmission requested      attempt limit reached → refused (the request's own
 *                               deadline is not in the response: left to the backend)
 *   any other submission        assignment CLOSED; deadline passed; resubmission not
 *                               allowed; attempt limit reached; work no longer
 *                               SUBMITTED or ASSIGNED (under review or later) → refused
 *
 * A maxResubmissions of 0 means "no limit", as in the backend. When this says
 * "allowed" the backend still decides — it is a UI hint, never the security check.
 */
import type { AssignmentStatus, SubmissionStatus } from "../api/types";

/** Statuses whose work may still be replaced (backend `RESUBMITTABLE`). */
const REPLACEABLE: readonly SubmissionStatus[] = ["SUBMITTED", "ASSIGNED"];

export interface OnBehalfInput {
  status: AssignmentStatus;
  deadline: string;
  allowResubmission: boolean;
  maxResubmissions: number;
  allowLateSubmission: boolean;
  submission: { status: SubmissionStatus; revisionCount: number } | null;
}

export type OnBehalfEligibility = { allowed: true } | { allowed: false; reason: string };

const refused = (reason: string): OnBehalfEligibility => ({ allowed: false, reason });

export function onBehalfEligibility(a: OnBehalfInput, now: number = Date.now()): OnBehalfEligibility {
  const deadlinePassed = now > new Date(a.deadline).getTime();
  const limitReached = (s: { revisionCount: number }) => a.maxResubmissions > 0 && s.revisionCount >= a.maxResubmissions;
  const sub = a.submission;

  if (sub?.status === "RESUBMISSION_REQUESTED") {
    return limitReached(sub) ? refused("The maximum number of resubmissions has been reached.") : { allowed: true };
  }
  if (a.status !== "PUBLISHED") return refused("This assignment is closed and no longer accepts submissions.");
  if (!sub) {
    return deadlinePassed && !a.allowLateSubmission ? refused("The deadline has passed and late submissions are not accepted.") : { allowed: true };
  }
  if (deadlinePassed) return refused("The deadline has passed, so the work can no longer be replaced.");
  if (!a.allowResubmission) return refused("This assignment does not allow resubmissions.");
  if (limitReached(sub)) return refused("The maximum number of resubmissions has been reached.");
  if (!REPLACEABLE.includes(sub.status)) return refused("The work is already under review (or past it) and can no longer be replaced.");
  return { allowed: true };
}
