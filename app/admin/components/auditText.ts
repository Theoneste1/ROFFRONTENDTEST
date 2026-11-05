/** Readable text for audit-log entries (`GET /admin/audit-logs`). */
import type { AuditCategory, AuditLogEntry } from "@/lib/api/types";
import { personName } from "@/lib/format";

/** "PUBLISH_ASSIGNMENT" → "Publish assignment". */
export function humanizeAction(action: string): string {
  const words = action.toLowerCase().split(/[_.\s]+/).filter(Boolean);
  if (!words.length) return action;
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

export function auditActor(e: AuditLogEntry): string {
  if (e.actor) return personName(e.actor);
  if (e.actorUsername) return e.actorUsername;
  return "System";
}

/** One line: who did what (with the record's title when the backend recorded one). */
export function describeAudit(e: AuditLogEntry): string {
  const title = typeof e.metadata?.title === "string" ? ` “${e.metadata.title}”` : "";
  return `${auditActor(e)}: ${humanizeAction(e.action)}${title}`;
}

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  USERS: "Users",
  ENROLLMENT: "Enrolment",
  MENTOR_ASSIGNMENTS: "Mentor access",
  ASSIGNMENTS: "Assignments",
  SUBMISSIONS: "Submissions",
  DISTRIBUTION: "Distribution",
  REVIEWS: "Reviews",
  RESULTS: "Results",
  MODERATION: "Moderation",
  SETTINGS: "Settings",
  ACADEMIC_YEARS: "Academic years",
  COURSES: "Courses",
  SECURITY: "Security",
  DATA_EXPORTS: "Data exports",
  STUDY_GROUPS: "Study groups",
  OTHER: "Other",
};
