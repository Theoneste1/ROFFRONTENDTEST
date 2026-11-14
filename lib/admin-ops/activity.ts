/**
 * Learning-activity log filters (pure; unit-tested in tests/admin-ops.test.mjs).
 * The values are the backend's ActivityType enum (prisma/schema.prisma).
 */
export const ACTIVITY_TYPES = [
  "LOGIN",
  "COURSE_OPENED",
  "COURSE_COMPLETED",
  "RESOURCE_VIEWED",
  "ASSIGNMENT_VIEWED",
  "SUBMISSION_CREATED",
  "SUBMISSION_RESUBMITTED",
  "RESULT_VIEWED",
  "THREAD_CREATED",
  "COMMENT_POSTED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  LOGIN: "Signed in",
  COURSE_OPENED: "Opened a course",
  COURSE_COMPLETED: "Completed a course",
  RESOURCE_VIEWED: "Viewed a resource",
  ASSIGNMENT_VIEWED: "Viewed an assignment",
  SUBMISSION_CREATED: "Submitted work",
  SUBMISSION_RESUBMITTED: "Resubmitted work",
  RESULT_VIEWED: "Viewed a result",
  THREAD_CREATED: "Started a discussion",
  COMMENT_POSTED: "Posted a comment",
};

export function isActivityType(v: string): v is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` date-input value as the ISO instant the API filters on: the
 * start of that day (`from`) or its last millisecond (`to`), in local time.
 * Anything else is dropped (undefined) rather than sent and refused.
 */
export function dayToIso(day: string, edge: "start" | "end"): string | undefined {
  if (!DAY.test(day)) return undefined;
  const d = new Date(`${day}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export interface ActivityQuery {
  userId?: string;
  courseId?: string;
  type?: ActivityType;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** URL search params → the query sent to GET /admin/activity (invalid values are left out). */
export function activityQuery(p: { userId?: string | null; courseId?: string | null; type?: string | null; from?: string | null; to?: string | null; page?: string | null }, limit = 25): ActivityQuery {
  const q: ActivityQuery = { page: Math.max(1, Number(p.page) || 1), limit };
  if (p.userId && isUuid(p.userId)) q.userId = p.userId;
  if (p.courseId && isUuid(p.courseId)) q.courseId = p.courseId;
  if (p.type && isActivityType(p.type)) q.type = p.type;
  const from = p.from ? dayToIso(p.from, "start") : undefined;
  const to = p.to ? dayToIso(p.to, "end") : undefined;
  if (from) q.from = from;
  if (to) q.to = to;
  return q;
}
