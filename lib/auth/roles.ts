import type { Role } from "@/lib/api/types";
import { isDeepLinkPath } from "@/lib/notifications/links";

/** Each role has exactly one portal. */
export const PORTAL_HOME: Record<Role, string> = {
  ADMIN: "/admin/dashboard",
  MENTOR: "/mentor/dashboard",
  STUDENT: "/student/dashboard",
};

const PORTAL_PREFIX: Record<Role, string> = {
  ADMIN: "/admin",
  MENTOR: "/mentor",
  STUDENT: "/student",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  MENTOR: "Mentor",
  STUDENT: "Student",
};

export function portalHome(role: Role): string {
  return PORTAL_HOME[role];
}

/**
 * Where to go after signing in. A `next` path is honoured only when it is an
 * internal path inside the user's own portal (no open redirects, no landing a
 * student on an admin URL), or a role-neutral notification link such as
 * `/discussions/:id`, which then redirects to the role's own page.
 */
export function postLoginPath(role: Role, next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    const prefix = PORTAL_PREFIX[role];
    if (next === prefix || next.startsWith(prefix + "/")) return next;
    if (isDeepLinkPath(next.split("?")[0])) return next;
  }
  return portalHome(role);
}
