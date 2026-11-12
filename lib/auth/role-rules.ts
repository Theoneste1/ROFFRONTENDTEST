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
 * Portals:
 * - students, coaches and administrators each have one;
 * - a Super Administrator uses the administrator portal (the backend grants it
 *   every administrator permission);
 * - a Teacher has the teacher portal (/teacher: the students of the schools an
 *   Administrator assigned, with the delegations an Administrator granted);
 * - a Head Coach uses the coach portal: like a coach, they prepare and grade
 *   only through course × division assignments an Administrator created, and
 *   the portal adds monitoring of the programmes they head;
 * - any unknown role sees the "no access configured" page.
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

export type PortalPrefix = "/student" | "/teacher" | "/mentor" | "/admin";

const PORTAL: Readonly<Record<KnownRole, PortalPrefix>> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  MENTOR: "/mentor",
  HEAD_COACH: "/mentor",
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
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

/** Roles any administrator can give today on every backend (the production backend accepts only these). */
export const BASE_ASSIGNABLE_ROLES: readonly KnownRole[] = ["STUDENT", "MENTOR", "ADMIN"];

/**
 * The roles the user form may offer. TEACHER / HEAD_COACH only when the
 * backend advertises `teacherAccounts` / `headCoachAccounts` (GET /api/v1
 * capabilities — false on LEGACY and UNKNOWN) AND the caller holds
 * `users.manageTeachers` / `users.manageHeadCoaches` in /me/permissions, as the
 * backend contract requires. SUPER_ADMIN is never offered (the API never gives
 * it on creation; promotion needs step-up — a later change).
 */
export function assignableRoles(opts: {
  teacherAccounts: boolean;
  headCoachAccounts: boolean;
  can: (permission: string) => boolean;
}): KnownRole[] {
  const roles: KnownRole[] = [...BASE_ASSIGNABLE_ROLES];
  if (opts.teacherAccounts && opts.can("users.manageTeachers")) roles.splice(1, 0, "TEACHER");
  if (opts.headCoachAccounts && opts.can("users.manageHeadCoaches")) roles.splice(roles.indexOf("ADMIN"), 0, "HEAD_COACH");
  return roles;
}

const ADMIN_ROLES: readonly string[] = ["ADMIN", "SUPER_ADMIN"];

/**
 * A role change to or from Administrator / Super Administrator needs the
 * editor's own current password (`currentPassword`; backend 403 STEP_UP_REQUIRED).
 */
export function roleChangeNeedsPassword(from: string | null | undefined, to: string | null | undefined): boolean {
  return !!from && !!to && from !== to && (ADMIN_ROLES.includes(from) || ADMIN_ROLES.includes(to));
}

/**
 * Promotion to Super Administrator, as the backend allows it: only by a Super
 * Administrator, only for an active, activated Administrator (and with the
 * password step-up). It is never offered when creating an account.
 */
export function canPromoteToSuperAdmin(actorRole: string | null | undefined, target: { role: string; isActive: boolean; activatedAt: string | null }): boolean {
  return actorRole === "SUPER_ADMIN" && target.role === "ADMIN" && target.isActive && !!target.activatedAt;
}

const TAB_LABEL: Readonly<Record<KnownRole, string>> = {
  STUDENT: "Students",
  TEACHER: "Teachers",
  MENTOR: "Coaches",
  HEAD_COACH: "Head Coaches",
  ADMIN: "Admins",
  SUPER_ADMIN: "Super Admins",
};

/**
 * Role filter tabs for the users list. The production backend accepts only
 * STUDENT, MENTOR and ADMIN as a filter (any other value is a 400), so the
 * newer roles are offered only when the backend is positively NEW and lists
 * them in `capabilities.roles` (`backendRoles`; null on LEGACY, UNKNOWN or
 * while loading).
 */
export function roleFilterTabs(backendRoles: readonly string[] | null): { label: string; value: "" | KnownRole }[] {
  const shown = ROLES.filter((r) => BASE_ASSIGNABLE_ROLES.includes(r) || (backendRoles?.includes(r) ?? false));
  return [{ label: "All", value: "" }, ...shown.map((r) => ({ label: TAB_LABEL[r], value: r }))];
}

/** Roles the backend serves `/me/notification-settings` (per-type switches) to. */
export function hasNotificationTypeSettings(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MENTOR" || role === "SUPER_ADMIN";
}
