/**
 * One visual status system for marking (owner 2026-11-26: "consistent badges, icons and supporting text"; never colour
 * alone). Every marking screen — the coach's queue and workspace, the Head Coach's review, the overviews — shows a
 * paper's or a marking's state through these tones and labels.
 *
 *   neutral  not assigned / not started      blue    in progress
 *   indigo   submitted / second marking      amber   awaiting review
 *   green    approved / published            red     returned for correction
 */
import type { MarkingStatus, QueueState } from "@/lib/api/test-marking";
import type { SubmissionStatus } from "@/lib/api/test-submissions";

export type MarkingTone = "neutral" | "blue" | "indigo" | "amber" | "green" | "red";
export type MarkingIcon = "notStarted" | "inProgress" | "submitted" | "review" | "approved" | "returned" | "second" | "published";

export interface MarkingStatusView {
  label: string;
  tone: MarkingTone;
  icon: MarkingIcon;
  /** One plain sentence for a tooltip / screen readers: what it means and who acts next. */
  hint: string;
}

/** Badge classes per tone (text contrast ≥ 4.5:1 on the tint). */
export const TONE_CLASS: Record<MarkingTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
};
/** A small dot / bar colour per tone (charts, progress). */
export const TONE_DOT: Record<MarkingTone, string> = {
  neutral: "bg-slate-400", blue: "bg-blue-600", indigo: "bg-indigo-600", amber: "bg-amber-500", green: "bg-emerald-600", red: "bg-red-600",
};

/** A paper (submission) as staff see it. */
export const SUBMISSION_STATUS: Record<SubmissionStatus, MarkingStatusView> = {
  SUBMITTED: { label: "Not assigned", tone: "neutral", icon: "notStarted", hint: "Submitted by the student; no coach is marking it yet." },
  ASSIGNED: { label: "Not started", tone: "neutral", icon: "notStarted", hint: "Assigned to a coach who has not started marking." },
  MARKING_IN_PROGRESS: { label: "In progress", tone: "blue", icon: "inProgress", hint: "A coach has started marking (draft saved)." },
  MARKED: { label: "Awaiting review", tone: "amber", icon: "review", hint: "Marking submitted; waiting for the Head Coach's approval." },
  AWAITING_SECOND_MARKING: { label: "Second marking", tone: "indigo", icon: "second", hint: "A second coach is marking it independently." },
  RETURNED: { label: "Returned for correction", tone: "red", icon: "returned", hint: "Sent back to the coach with a reason; waiting for the corrected marking." },
  APPROVED: { label: "Approved", tone: "green", icon: "approved", hint: "Marks approved and locked; ready to publish." },
  PUBLISHED: { label: "Published", tone: "green", icon: "published", hint: "The result is published to the student." },
};

/** A paper in a coach's queue (the coach never sees the student; blind marking). */
export function queueStatus(state: QueueState, returned: boolean): MarkingStatusView {
  if (returned) return { label: "Returned for correction", tone: "red", icon: "returned", hint: "The Head Coach sent your marking back: read the reason, correct it and submit again." };
  switch (state) {
    case "NOT_STARTED": return { label: "Not started", tone: "neutral", icon: "notStarted", hint: "Assigned to you; not marked yet." };
    case "IN_PROGRESS": return { label: "In progress", tone: "blue", icon: "inProgress", hint: "Your draft is saved; submit it when every question is marked." };
    case "MARKED": return { label: "Submitted", tone: "indigo", icon: "submitted", hint: "Your marking is submitted to the Head Coach." };
  }
}

/** A coach's own marking (the workspace). */
export const MY_MARKING_STATUS: Record<MarkingStatus, MarkingStatusView> = {
  DRAFT: { label: "In progress", tone: "blue", icon: "inProgress", hint: "Draft saved; you can keep changing it." },
  SUBMITTED: { label: "Submitted", tone: "indigo", icon: "submitted", hint: "Submitted to the Head Coach; it can no longer be changed." },
  APPROVED: { label: "Approved", tone: "green", icon: "approved", hint: "Approved by the Head Coach and locked." },
  RETURNED: { label: "Returned for correction", tone: "red", icon: "returned", hint: "Correct it as asked and submit again." },
};
