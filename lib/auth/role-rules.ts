/**
 * Every role-dependent decision of the app, in one place and without imports
 * (unit-tested in tests/roles.test.mjs).
 *
 * The backend has six user types (`role`): STUDENT, TEACHER, MENTOR (shown as
 * "Coach"), HEAD_COACH, ADMIN and SUPER_ADMIN. The production backend still
 * returns only STUDENT, MENTOR and ADMIN; everything here also works with any
 * other value, which is treated as an unknown role (never a crash, never a
 * redirect loop).
 *
 * Portals: students, coaches and administrators each have one. A Super
 * Administrator uses the administrator portal (the backend grants it every
 * administrator permission). Teachers and Head Coaches have no portal on this
 * site yet: they, and any unknown role, see the "no access configured" page.
 *
 * Hiding by role is navigation only; the backend enforces every permission.
 */

export const ROLES = ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"] as const;
export type KnownRole = (typeof ROLES)[number];

export const ROLE_LABEL: Readonly<Record<KnownRole, string>> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  MENTOR: "Coach",
  HEAD_COACH: "Head Coach",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super Administrator",
};

/** The page for a signed-in account whose role has no portal on this site. */
export const NO_ACCESS_PATH = "/no-access";

export type PortalPrefix = "/student" | "/mentor" | "/admin";

const PORTAL: Readonly<Record<KnownRole, PortalPrefix | null>> = {
  STUDENT: "/student",
  MENTOR: "/mentor",
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
  TEACHER: null,
  HEAD_COACH: null,
};

export function isKnownRole(role: unknown): role is KnownRole {
  return typeof role === "string" && (ROLES as readonly string[]).includes(role);
}

/** "Coach", "Super Administrator", … — or "Unknown account type" for a value this app does not know. */
export function roleLabel(role: string | null | undefined): string {
  return isKnownRole(role) ? ROLE_LABEL[role] : "Unknown account type";
}

/** The route prefix of the role's portal, or null when it has none here. */
export function portalPrefix(role: string | null | undefined): PortalPrefix | null {
  return isKnownRole(role) ? PORTAL[role] : null;
}

export function hasPortal(role: string | null | undefined): boolean {
  return portalPrefix(role) !== null;
}

/** The role's dashboard, or the "no access configured" page. */
export function portalHome(role: string | null | undefined): string {
  const prefix = portalPrefix(role);
  return prefix ? `${prefix}/dashboard` : NO_ACCESS_PATH;
}

/** A page in the role's portal, e.g. portalPath("MENTOR", "notifications") → "/mentor/notifications" (no portal: the "no access" page). */
export function portalPath(role: string | null | undefined, page: string): string {
  const prefix = portalPrefix(role);
  return prefix ? `${prefix}/${page.replace(/^\/+/, "")}` : NO_ACCESS_PATH;
}

/** Whether `role` may use the portal that `portalRole` uses (a Super Administrator uses the administrator portal). */
export function sharesPortal(role: string | null | undefined, portalRole: KnownRole): boolean {
  const prefix = portalPrefix(role);
  return prefix !== null && prefix === PORTAL[portalRole];
}

/** Administrator or Super Administrator. */
export function isAdministrative(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Roles the backend serves `/me/notification-settings` (per-type switches) to. */
export function hasNotificationTypeSettings(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MENTOR" || role === "SUPER_ADMIN";
}
