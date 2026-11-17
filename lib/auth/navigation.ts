/**
 * Portal menus and the permission each item needs (unit-tested in tests/roles.test.mjs and
 * tests/notifications.test.mjs).
 *
 * Every permission named here is in the list `GET /me/permissions` returns
 * for that portal's roles today — including the frozen ADMIN / MENTOR lists
 * of the backend (the newer administrative names such as `schools.manage` are
 * NOT in the ADMIN list, so they are not used here). A Super Administrator's
 * list contains every administrative permission; a DENY override removes the
 * permission from the list, which hides its menu item.
 *
 * Hiding is navigation only: the API refuses everything not permitted.
 */
import type { Permission } from "../api/types";
import { NOTIFICATION_DELIVERIES_PERMISSION } from "../admin/notification-deliveries";
import { FORMS_VIEW_PERMISSION } from "../admin/form-availability";

export interface NavItem {
  href: string;
  label: string;
  /** The permission the area's main API calls need; undefined = everyone in the portal. */
  permission?: string;
}

export const ADMIN_NAV: readonly NavItem[] = [
  { href: "/admin/dashboard", label: "Menu" },
  { href: "/admin/users", label: "Users", permission: "users.manage" },
  { href: "/admin/mentors", label: "Coaches", permission: "mentorAssignments.manage" },
  { href: "/admin/students", label: "Students", permission: "users.manage" },
  // The school list is served to ADMIN and SUPER_ADMIN by role (GET /schools, no permission);
  // the page itself chooses the managed directory (schools.manage) or the read-only list.
  { href: "/admin/schools", label: "Schools" },
  { href: "/admin/divisions", label: "Divisions", permission: "divisions.manage" },
  { href: "/admin/academic-years", label: "Academic Years", permission: "academicYears.manage" },
  { href: "/admin/courses", label: "Courses", permission: "courses.manage" },
  { href: "/admin/assignments", label: "Assignments", permission: "assignments.publish" },
  { href: "/admin/results", label: "Results", permission: "results.publish" },
  { href: "/admin/reports", label: "Reports", permission: "reports.export" },
  { href: "/admin/audit-log", label: "Audit Log", permission: "audit.view" },
  { href: "/admin/activity", label: "Activity", permission: "activity.view" },
  { href: "/admin/email", label: "E-mail", permission: "email.bulkSend" },
  { href: "/admin/moderation", label: "Moderation", permission: "discussions.moderate" },
  // Contact messages are served to ADMIN and SUPER_ADMIN by role, not by a permission.
  { href: "/admin/messages", label: "Messages" },
];

/**
 * Teacher applications (teacher self-registration review). Not part of ADMIN_NAV: its permission
 * (users.manageTeachers) is not in the frozen ADMIN list, and the page exists only on a backend
 * advertising `teacherSelfRegistration`. The Sidebar shows it only when both are definitely known
 * (lib/admin/teacher-applications.ts → teacherApplicationsNavVisible).
 */
export const ADMIN_TEACHER_APPLICATIONS: NavItem = { href: "/admin/teacher-applications", label: "Teacher Applications", permission: "users.manageTeachers" };

/**
 * Notification delivery log. Kept out of the frozen ADMIN_NAV and shown after it, like the other
 * separately gated items; its permission is the single constant NOTIFICATION_DELIVERIES_PERMISSION
 * (email.bulkSend, held by ADMIN and SUPER_ADMIN).
 */
export const ADMIN_NOTIFICATION_DELIVERIES: NavItem = { href: "/admin/notification-deliveries", label: "Notification Deliveries", permission: NOTIFICATION_DELIVERIES_PERMISSION };

/**
 * Forms (open, close, schedule and the closed messages of the registration and website forms). Separately
 * gated like the items above: a backend advertising `formAvailability` and the known forms.view
 * (lib/admin/form-availability.ts → formsNavVisible).
 */
export const ADMIN_FORMS: NavItem = { href: "/admin/forms", label: "Forms", permission: FORMS_VIEW_PERMISSION };

/** The administrators' "Settings" link (platform settings). */
export const ADMIN_SETTINGS: NavItem = { href: "/admin/settings", label: "Settings", permission: "settings.manage" };

/**
 * The coach portal (coaches and Head Coaches). Courses need only courses.view:
 * a Head Coach reads resources (resource management stays behind
 * resources.manage inside the page). Programme is the Head Coach's monitoring
 * of the programmes they head (coaches.monitor: Head Coaches, not coaches).
 */
export const MENTOR_NAV: readonly NavItem[] = [
  { href: "/mentor/dashboard", label: "Dashboard" },
  { href: "/mentor/courses", label: "Courses", permission: "courses.view" },
  { href: "/mentor/assignments", label: "Assignments", permission: "assignments.prepare" },
  { href: "/mentor/reviews", label: "Reviews", permission: "reviews.grade" },
  { href: "/mentor/programme", label: "Programme", permission: "coaches.monitor" },
];

/** The teacher portal: the students of the teacher's assigned schools (students.viewScoped, a Teacher default). */
export const TEACHER_NAV: readonly NavItem[] = [
  { href: "/teacher/dashboard", label: "My students", permission: "students.viewScoped" },
];

/**
 * Whether an item is shown. `permissions` null means "not known yet" (still
 * loading, or the request failed): the item is shown rather than hiding the
 * whole menu — the API still refuses anything not permitted.
 */
export function canSeeNavItem(item: Pick<NavItem, "permission">, permissions: ReadonlySet<string> | null): boolean {
  if (!item.permission || permissions === null) return true;
  return permissions.has(item.permission);
}

export function visibleNav(items: readonly NavItem[], permissions: ReadonlySet<string> | null): NavItem[] {
  return items.filter((item) => canSeeNavItem(item, permissions));
}

/**
 * For an action button: may it be offered? Known permissions decide. When `/me/permissions`
 * FAILED to load, the action is offered and the backend decides (it refuses anything not
 * permitted) — as on the original frontend, which never consulted the list. While the list is
 * still loading, the action waits (no button flashing in and out).
 */
export function actionAllowed(permission: Permission, status: "loading" | "ready" | "error", can: (p: Permission) => boolean): boolean {
  if (status === "error") return true;
  return status === "ready" && can(permission);
}
