/**
 * Where a notification (or an e-mailed link) opens, for the signed-in role.
 *
 * The backend writes two kinds of `link` (src/notifications/notification.listener.ts):
 * - role-prefixed: `/mentor/reviews/:id`, `/admin/submissions/:id`, … → used as is,
 *   but only for that role;
 * - role-neutral: `/assignments/:id`, `/results/:submissionId`,
 *   `/courses/:courseId/resources/:resourceId`, `/discussions/:threadId` → mapped
 *   to the role's own page.
 * The same paths exist as redirect routes (app/assignments, app/results, …) so
 * links in e-mails (APP_URL + link) work too.
 *
 * Returning null means "nothing to open for this role". Never a page of
 * another portal: the backend would refuse it anyway.
 */
import type { AppNotification, Role } from "@/lib/api/types";

const PREFIX: Record<Role, string> = { STUDENT: "/student", MENTOR: "/mentor", ADMIN: "/admin" };

const ID = "([A-Za-z0-9-]{1,64})";
const RE = {
  assignment: new RegExp(`^/assignments/${ID}/?$`),
  result: new RegExp(`^/results/${ID}/?$`),
  resource: new RegExp(`^/courses/${ID}/resources/${ID}/?$`),
  discussion: new RegExp(`^/discussions/${ID}/?$`),
};

/** Role-prefixed paths the backend links to, per role (all exist in this app). */
const ROLE_PATHS: Record<Role, RegExp[]> = {
  STUDENT: [/^\/student\//],
  MENTOR: [/^\/mentor\/assignments\/[\w-]+\/?$/, /^\/mentor\/reviews\/?$/, /^\/mentor\/reviews\/[\w-]+\/?$/],
  ADMIN: [/^\/admin\/assignments\/[\w-]+\/?$/, /^\/admin\/submissions\/[\w-]+\/?$/, /^\/admin\/moderation\/reports\/[\w-]+\/?$/],
};

/** The role-neutral paths that have redirect routes (also allowed as `?next=` after sign-in). */
export function isDeepLinkPath(path: string): boolean {
  return Object.values(RE).some((re) => re.test(path));
}

export function discussionHref(role: Role, threadId: string): string {
  return `${PREFIX[role]}/discussions/${threadId}`;
}

/**
 * Maps a backend path (with optional query) to this app's route for `role`.
 * `/results/:id` for a student without a known assignment returns the
 * redirect route, which looks the assignment up.
 */
export function resolveLink(link: string, role: Role, data?: Record<string, string | undefined> | null): string | null {
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  const [path, query = ""] = link.split("?", 2);
  const qs = query ? `?${query}` : "";
  let m: RegExpMatchArray | null;

  if ((m = path.match(RE.assignment))) return `${PREFIX[role]}/assignments/${m[1]}`;

  if ((m = path.match(RE.result))) {
    if (role !== "STUDENT") return null;
    return data?.assignmentId ? `/student/assignments/${data.assignmentId}?tab=results` : `/results/${m[1]}`;
  }

  if ((m = path.match(RE.resource))) {
    if (role === "STUDENT") return `/student/courses/${m[1]}?resource=${m[2]}`;
    if (role === "ADMIN") return `/admin/courses/resources?scope=${m[1]}`;
    return "/mentor/courses";
  }

  if ((m = path.match(RE.discussion))) return discussionHref(role, m[1]);

  if (ROLE_PATHS[role].some((re) => re.test(path))) return path + qs;
  return null;
}

/** Destination of a notification, or null when it has nothing to open. */
export function notificationHref(n: Pick<AppNotification, "link" | "data">, role: Role): string | null {
  if (n.link) return resolveLink(n.link, role, n.data);
  // Moderation notices carry the thread id but no link.
  if (n.data?.threadId) return discussionHref(role, n.data.threadId);
  return null;
}
