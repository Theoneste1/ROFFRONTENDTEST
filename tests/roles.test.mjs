// Six roles and unknown values (lib/auth/role-rules.ts, lib/auth/roles.ts,
// lib/notifications/links.ts): no crash, no redirect loop, Super Admin uses the
// administrator portal, Teacher / Head Coach / unknown get the "no access" page.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NO_ACCESS_PATH,
  ROLES,
  hasNotificationTypeSettings,
  hasPortal,
  isAdministrative,
  isKnownRole,
  portalHome,
  portalPath,
  portalPrefix,
  roleLabel,
  sharesPortal,
} from "../lib/auth/role-rules.ts";
import { BASE_ASSIGNABLE_ROLES, assignableRoles, roleFilterTabs } from "../lib/auth/role-rules.ts";
import { ADMIN_NAV, ADMIN_SETTINGS, MENTOR_NAV, TEACHER_NAV, canSeeNavItem, visibleNav } from "../lib/auth/navigation.ts";
import { postLoginPath } from "../lib/auth/roles.ts";
import { discussionHref, isDeepLinkPath, notificationHref, resolveLink } from "../lib/notifications/links.ts";

const UNKNOWN = ["GUEST", "", "admin", null, undefined];

test("all six backend roles are known; anything else is not", () => {
  assert.deepEqual([...ROLES], ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"]);
  for (const r of ROLES) assert.equal(isKnownRole(r), true, r);
  for (const r of UNKNOWN) assert.equal(isKnownRole(r), false, String(r));
});

test("labels: every role has its label; an unknown value gets a safe label", () => {
  assert.deepEqual(
    ROLES.map(roleLabel),
    ["Student", "Teacher", "Coach", "Head Coach", "Administrator", "Super Administrator"],
  );
  for (const r of UNKNOWN) assert.equal(roleLabel(r), "Unknown account type", String(r));
});

test("portals: student, coach and administrator; Super Admin uses the administrator portal", () => {
  assert.equal(portalHome("STUDENT"), "/student/dashboard");
  assert.equal(portalHome("MENTOR"), "/mentor/dashboard");
  assert.equal(portalHome("ADMIN"), "/admin/dashboard");
  assert.equal(portalHome("SUPER_ADMIN"), "/admin/dashboard");
  assert.equal(portalPath("SUPER_ADMIN", "notifications"), "/admin/notifications");
  assert.equal(portalPath("MENTOR", "/profile"), "/mentor/profile");
});

test("Teacher has the teacher portal; Head Coach uses the coach portal", () => {
  assert.equal(portalHome("TEACHER"), "/teacher/dashboard");
  assert.equal(portalPath("TEACHER", "notifications"), "/teacher/notifications");
  assert.equal(portalHome("HEAD_COACH"), "/mentor/dashboard");
  assert.equal(portalPath("HEAD_COACH", "programme"), "/mentor/programme");
});

test("unknown roles have no portal: always the 'no access' page", () => {
  for (const r of UNKNOWN) {
    assert.equal(hasPortal(r), false, String(r));
    assert.equal(portalPrefix(r), null, String(r));
    assert.equal(portalHome(r), NO_ACCESS_PATH, String(r));
    assert.equal(portalPath(r, "notifications"), NO_ACCESS_PATH, String(r));
  }
});

test("portal gates: each gate admits its portal's roles only", () => {
  assert.equal(sharesPortal("ADMIN", "ADMIN"), true);
  assert.equal(sharesPortal("SUPER_ADMIN", "ADMIN"), true, "Super Admin passes the administrator gate");
  assert.equal(sharesPortal("MENTOR", "MENTOR"), true);
  assert.equal(sharesPortal("HEAD_COACH", "MENTOR"), true, "Head Coach passes the coach gate");
  assert.equal(sharesPortal("TEACHER", "TEACHER"), true);
  assert.equal(sharesPortal("STUDENT", "STUDENT"), true);
  assert.equal(sharesPortal("SUPER_ADMIN", "MENTOR"), false);
  assert.equal(sharesPortal("STUDENT", "ADMIN"), false);
  assert.equal(sharesPortal("MENTOR", "ADMIN"), false);
  assert.equal(sharesPortal("MENTOR", "TEACHER"), false, "a coach is not a teacher");
  for (const gate of ["STUDENT", "MENTOR", "ADMIN"]) assert.equal(sharesPortal("TEACHER", gate), false, `TEACHER @ ${gate}`);
  for (const gate of ["STUDENT", "TEACHER", "ADMIN"]) assert.equal(sharesPortal("HEAD_COACH", gate), false, `HEAD_COACH @ ${gate}`);
  for (const r of UNKNOWN) {
    for (const gate of ["STUDENT", "TEACHER", "MENTOR", "ADMIN"]) assert.equal(sharesPortal(r, gate), false, `${String(r)} @ ${gate}`);
  }
});

test("no redirect loop: every role is sent to its own portal home (admitted there) or to /no-access (no gate)", () => {
  const gateOf = { STUDENT: "STUDENT", TEACHER: "TEACHER", MENTOR: "MENTOR", HEAD_COACH: "MENTOR", ADMIN: "ADMIN", SUPER_ADMIN: "ADMIN" };
  for (const r of ROLES) assert.equal(sharesPortal(r, gateOf[r]), true, `${r} is admitted where portalHome sends it (${portalHome(r)})`);
  for (const r of UNKNOWN) {
    const target = portalHome(r);
    assert.equal(target, NO_ACCESS_PATH);
    assert.ok(!["/student", "/teacher", "/mentor", "/admin"].some((p) => target.startsWith(p)));
  }
});

test("administrative roles and notification-type settings follow the backend", () => {
  assert.deepEqual(ROLES.filter(isAdministrative), ["ADMIN", "SUPER_ADMIN"]);
  assert.deepEqual(ROLES.filter(hasNotificationTypeSettings), ["MENTOR", "ADMIN", "SUPER_ADMIN"]);
  for (const r of UNKNOWN) {
    assert.equal(isAdministrative(r), false);
    assert.equal(hasNotificationTypeSettings(r), false);
  }
});

test("postLoginPath: own-portal next paths and deep links honoured; others and open redirects refused", () => {
  assert.equal(postLoginPath("STUDENT", "/student/courses"), "/student/courses");
  assert.equal(postLoginPath("STUDENT", "/admin/users"), "/student/dashboard", "no landing in another portal");
  assert.equal(postLoginPath("SUPER_ADMIN", "/admin/users"), "/admin/users");
  assert.equal(postLoginPath("ADMIN", "//evil.example/x"), "/admin/dashboard", "no protocol-relative redirect");
  assert.equal(postLoginPath("ADMIN", "https://evil.example"), "/admin/dashboard");
  assert.equal(postLoginPath("ADMIN", "/admin\\..\\x"), "/admin/dashboard");
  assert.equal(postLoginPath("MENTOR", "/discussions/abc-123"), "/discussions/abc-123", "role-neutral deep link");
  assert.equal(postLoginPath("MENTOR", null), "/mentor/dashboard");
});

test("postLoginPath: Teacher and Head Coach land in their own portal, never another one", () => {
  assert.equal(postLoginPath("TEACHER", null), "/teacher/dashboard");
  assert.equal(postLoginPath("TEACHER", "/teacher/students/s1"), "/teacher/students/s1");
  assert.equal(postLoginPath("TEACHER", "/student/courses"), "/teacher/dashboard");
  assert.equal(postLoginPath("TEACHER", "/admin/users"), "/teacher/dashboard");
  assert.equal(postLoginPath("HEAD_COACH", null), "/mentor/dashboard");
  assert.equal(postLoginPath("HEAD_COACH", "/mentor/programme"), "/mentor/programme");
  assert.equal(postLoginPath("HEAD_COACH", "/admin/reports"), "/mentor/dashboard", "admin URLs are not the Head Coach's portal");
});

test("postLoginPath: unknown roles always go to the 'no access' page", () => {
  for (const r of UNKNOWN) {
    assert.equal(postLoginPath(r, "/student/courses"), NO_ACCESS_PATH, String(r));
    assert.equal(postLoginPath(r, "/discussions/abc-123"), NO_ACCESS_PATH, String(r));
    assert.equal(postLoginPath(r, null), NO_ACCESS_PATH, String(r));
  }
});

test("links: Super Admin gets the administrator pages", () => {
  assert.equal(resolveLink("/assignments/a1", "SUPER_ADMIN"), "/admin/assignments/a1");
  assert.equal(resolveLink("/admin/submissions/s1", "SUPER_ADMIN"), "/admin/submissions/s1");
  assert.equal(resolveLink("/courses/c1/resources/r1", "SUPER_ADMIN"), "/admin/courses/resources?scope=c1");
  assert.equal(discussionHref("SUPER_ADMIN", "t1"), "/admin/discussions/t1");
  assert.equal(resolveLink("/results/s1", "SUPER_ADMIN"), null, "results are student pages");
});

test("links: existing roles behave exactly as before", () => {
  assert.equal(resolveLink("/assignments/a1", "STUDENT"), "/student/assignments/a1");
  assert.equal(resolveLink("/results/s1", "STUDENT", { assignmentId: "a1" }), "/student/assignments/a1?tab=results");
  assert.equal(resolveLink("/results/s1", "STUDENT"), "/results/s1");
  assert.equal(resolveLink("/courses/c1/resources/r1", "STUDENT"), "/student/courses/c1?resource=r1");
  assert.equal(resolveLink("/courses/c1/resources/r1", "MENTOR"), "/mentor/courses");
  assert.equal(resolveLink("/mentor/reviews/s1?x=1", "MENTOR"), "/mentor/reviews/s1?x=1");
  assert.equal(resolveLink("/admin/users", "ADMIN"), null, "not a linkable admin path");
  assert.equal(resolveLink("/mentor/reviews/s1", "STUDENT"), null, "never another portal");
  assert.equal(resolveLink("//evil.example", "ADMIN"), null);
  assert.equal(discussionHref("MENTOR", "t1"), "/mentor/discussions/t1");
});

test("links: unknown roles get nothing to open (no crash)", () => {
  for (const r of UNKNOWN) {
    assert.equal(resolveLink("/assignments/a1", r), null, String(r));
    assert.equal(resolveLink("/student/assignments/a1", r), null, String(r));
    assert.equal(discussionHref(r, "t1"), null, String(r));
    assert.equal(notificationHref({ link: "/discussions/t1", data: null }, r), null, String(r));
    assert.equal(notificationHref({ link: null, data: { threadId: "t1" } }, r), null, String(r));
  }
});

test("links: a Teacher has no course, assignment or discussion pages — only their student pages open", () => {
  for (const link of ["/assignments/a1", "/results/s1", "/courses/c1/resources/r1", "/discussions/t1", "/student/assignments/a1", "/mentor/reviews/s1", "//evil.example"]) {
    assert.equal(resolveLink(link, "TEACHER"), null, link);
  }
  assert.equal(discussionHref("TEACHER", "t1"), null);
  assert.equal(notificationHref({ link: null, data: { threadId: "t1" } }, "TEACHER"), null);
  assert.equal(resolveLink("/teacher/students/s1", "TEACHER"), "/teacher/students/s1");
});

test("links: a Head Coach gets the coach portal's pages", () => {
  assert.equal(resolveLink("/assignments/a1", "HEAD_COACH"), "/mentor/assignments/a1");
  assert.equal(resolveLink("/mentor/reviews/s1", "HEAD_COACH"), "/mentor/reviews/s1");
  assert.equal(discussionHref("HEAD_COACH", "t1"), "/mentor/discussions/t1");
  assert.equal(resolveLink("/admin/submissions/s1", "HEAD_COACH"), null, "never the administrator portal");
});

test("deep-link paths are unchanged", () => {
  for (const p of ["/assignments/a1", "/results/s1", "/courses/c1/resources/r1", "/discussions/t1"]) assert.equal(isDeepLinkPath(p), true, p);
  for (const p of ["/admin/users", "/student/dashboard", "/assignments/"]) assert.equal(isDeepLinkPath(p), false, p);
});

// ─── Permission-driven menus ────────────────────────────────────────────────
// The lists GET /me/permissions returns (backend src/auth/permissions.ts: ROLE_PERMISSIONS for
// ADMIN / MENTOR — frozen — and the SUPER_ADMIN grants).
// ADMIN_LIST: the PRODUCTION backend (main a8df186, 25 entries). The frontend must keep working
// with it, so the menu checks below use this, the strictest list.
const ADMIN_LIST = [
  "courses.view", "resources.view", "resources.manage", "assignments.view", "assignments.publish", "submissions.distribute",
  "results.approve", "results.publish", "discussions.participate", "discussions.report", "discussions.moderate",
  "analytics.course", "leaderboard.view", "reports.export", "users.manage", "academicYears.manage", "enrollments.manage",
  "divisions.manage", "courses.manage", "mentorAssignments.manage", "mentorRequests.decide", "settings.manage",
  "email.bulkSend", "audit.view", "activity.view",
];
// ADMIN_LIST_DEVELOP: backend develop with the ADMIN permission fix — the list also ends with
// schools.manage (2026-11-12) and users.manageTeachers (2026-11-13). Administrators already HELD both;
// the list now reports them. Nothing else was added (no Head Coach, Admin or Super-Admin-only permission).
const ADMIN_LIST_DEVELOP = [...ADMIN_LIST, "schools.manage", "users.manageTeachers"];
const MENTOR_LIST = [
  "courses.view", "resources.view", "resources.manage", "assignments.view", "assignments.prepare", "reviews.grade",
  "discussions.participate", "discussions.report", "analytics.course", "leaderboard.view",
];
const SUPER_ADMIN_LIST = [
  ...ADMIN_LIST, "reports.view", "students.viewScoped", "users.view", "users.manageStudents", "users.manageCoaches",
  "users.manageTeachers", "users.manageHeadCoaches", "users.manageAdmins", "programmes.manageHeads", "programmes.manageMembers",
  "coaches.monitor", "permissions.view", "permissions.manageOverrides", "settings.manageSystem", "schools.manage", "schools.syncDirectory",
];
const hrefs = (items) => items.map((i) => i.href);

// Effective grants the backend returns today (src/permissions catalogue, develop 9fd1942).
const HEAD_COACH_LIST = [
  "courses.view", "resources.view", "assignments.view", "assignments.prepare", "reviews.grade",
  "discussions.participate", "discussions.report", "analytics.course", "leaderboard.view", "reports.view",
  "students.viewScoped", "users.view", "users.manageStudents", "users.manageCoaches", "programmes.manageMembers",
  "mentorAssignments.manage", "coaches.monitor", "activity.view",
];
const TEACHER_BASE = ["courses.view", "resources.view", "assignments.view", "discussions.participate", "discussions.report", "students.viewScoped", "leaderboard.view"];

test("menus: today's ADMIN and MENTOR lists show every item they had before (no regression)", () => {
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, new Set(ADMIN_LIST))), hrefs(ADMIN_NAV));
  assert.equal(canSeeNavItem(ADMIN_SETTINGS, new Set(ADMIN_LIST)), true);
  assert.deepEqual(
    hrefs(visibleNav(MENTOR_NAV, new Set(MENTOR_LIST))),
    ["/mentor/dashboard", "/mentor/courses", "/mentor/assignments", "/mentor/reviews"],
    "a coach keeps exactly the four items and never sees Programme",
  );
});

test("menus: a Head Coach sees the coach menu plus Programme", () => {
  assert.deepEqual(hrefs(visibleNav(MENTOR_NAV, new Set(HEAD_COACH_LIST))), hrefs(MENTOR_NAV));
  assert.ok(hrefs(MENTOR_NAV).includes("/mentor/programme"));
});

test("menus: a Teacher sees My students only while holding students.viewScoped", () => {
  assert.deepEqual(hrefs(visibleNav(TEACHER_NAV, new Set(TEACHER_BASE))), ["/teacher/dashboard"]);
  assert.deepEqual(hrefs(visibleNav(TEACHER_NAV, new Set(TEACHER_BASE.filter((p) => p !== "students.viewScoped")))), []);
});

test("menus: every permission a menu needs is held by a role of its portal", () => {
  for (const item of [...ADMIN_NAV, ADMIN_SETTINGS]) if (item.permission) assert.ok(ADMIN_LIST.includes(item.permission), item.href);
  for (const item of MENTOR_NAV) {
    if (item.permission) assert.ok(MENTOR_LIST.includes(item.permission) || HEAD_COACH_LIST.includes(item.permission), item.href);
  }
  for (const item of TEACHER_NAV) if (item.permission) assert.ok(TEACHER_BASE.includes(item.permission), item.href);
});

test("menus: a Super Administrator sees the whole administrator menu", () => {
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, new Set(SUPER_ADMIN_LIST))), hrefs(ADMIN_NAV));
  assert.equal(canSeeNavItem(ADMIN_SETTINGS, new Set(SUPER_ADMIN_LIST)), true);
});

test("menus: a DENY override hides exactly its own item", () => {
  const withoutAudit = new Set(ADMIN_LIST.filter((p) => p !== "audit.view"));
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, withoutAudit)), hrefs(ADMIN_NAV).filter((h) => h !== "/admin/audit-log"));
  const withoutSettings = new Set(ADMIN_LIST.filter((p) => p !== "settings.manage"));
  assert.equal(canSeeNavItem(ADMIN_SETTINGS, withoutSettings), false);
  const coachWithoutGrading = new Set(MENTOR_LIST.filter((p) => p !== "reviews.grade"));
  assert.deepEqual(hrefs(visibleNav(MENTOR_NAV, coachWithoutGrading)), ["/mentor/dashboard", "/mentor/courses", "/mentor/assignments"]);
});

test("menus: unknown permissions (loading or failed) show every item; an empty list keeps the always-on items", () => {
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, null)), hrefs(ADMIN_NAV));
  assert.equal(canSeeNavItem(ADMIN_SETTINGS, null), true);
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, new Set())), ["/admin/dashboard", "/admin/messages"]);
});

// ─── Role options and filters from the backend's capabilities ───────────────

const can = (list) => (p) => list.includes(p);

test("assignable roles: Student, Coach, Administrator on every backend (no capabilities needed)", () => {
  assert.deepEqual(assignableRoles({ teacherAccounts: false, headCoachAccounts: false, can: can(ADMIN_LIST) }), ["STUDENT", "MENTOR", "ADMIN"]);
  assert.deepEqual([...BASE_ASSIGNABLE_ROLES], ["STUDENT", "MENTOR", "ADMIN"]);
});

test("assignable roles: Teacher / Head Coach need BOTH the backend feature and the caller's permission", () => {
  assert.deepEqual(assignableRoles({ teacherAccounts: true, headCoachAccounts: true, can: can(SUPER_ADMIN_LIST) }), ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN"]);
  assert.deepEqual(assignableRoles({ teacherAccounts: true, headCoachAccounts: false, can: can(SUPER_ADMIN_LIST) }), ["STUDENT", "TEACHER", "MENTOR", "ADMIN"]);
  assert.deepEqual(assignableRoles({ teacherAccounts: false, headCoachAccounts: false, can: can(SUPER_ADMIN_LIST) }), ["STUDENT", "MENTOR", "ADMIN"], "feature off: never offered");
  // The production ADMIN list is frozen and lacks users.manageTeachers / manageHeadCoaches.
  assert.deepEqual(assignableRoles({ teacherAccounts: true, headCoachAccounts: true, can: can(ADMIN_LIST) }), ["STUDENT", "MENTOR", "ADMIN"]);
});

test("ADMIN permission fix: an ordinary Administrator is offered Teacher only with the backend fix AND TEACHERS_ENABLED; never Head Coach", () => {
  // Backend fixed (users.manageTeachers reported) and the Teacher role switched on → Teacher offered.
  assert.deepEqual(assignableRoles({ teacherAccounts: true, headCoachAccounts: true, can: can(ADMIN_LIST_DEVELOP) }), ["STUDENT", "TEACHER", "MENTOR", "ADMIN"]);
  // TEACHERS_ENABLED off (production default) → still not offered: the flag keeps its effect.
  assert.deepEqual(assignableRoles({ teacherAccounts: false, headCoachAccounts: true, can: can(ADMIN_LIST_DEVELOP) }), ["STUDENT", "MENTOR", "ADMIN"]);
  // Head Coach needs users.manageHeadCoaches, which the fix deliberately does not report (owner decision D-5 pending).
  assert.ok(!assignableRoles({ teacherAccounts: true, headCoachAccounts: true, can: can(ADMIN_LIST_DEVELOP) }).includes("HEAD_COACH"));
});

test("ADMIN permission fix: exactly two entries added; no Head Coach, Admin-management or Super-Admin-only permission", () => {
  assert.deepEqual(ADMIN_LIST_DEVELOP.filter((p) => !ADMIN_LIST.includes(p)), ["schools.manage", "users.manageTeachers"]);
  for (const p of ["users.manageHeadCoaches", "users.manageAdmins", "programmes.manageHeads", "permissions.manageOverrides", "settings.manageSystem", "schools.syncDirectory"]) {
    assert.ok(!ADMIN_LIST_DEVELOP.includes(p), p);
  }
  // Everything an Administrator is now told about, a Super Administrator holds too.
  for (const p of ADMIN_LIST_DEVELOP) assert.ok(SUPER_ADMIN_LIST.includes(p), p);
});

test("ADMIN permission fix: the administrator menu is unchanged with the fixed list; other roles gain nothing", () => {
  assert.deepEqual(hrefs(visibleNav(ADMIN_NAV, new Set(ADMIN_LIST_DEVELOP))), hrefs(ADMIN_NAV));
  for (const list of [MENTOR_LIST, HEAD_COACH_LIST, TEACHER_BASE]) {
    assert.deepEqual(assignableRoles({ teacherAccounts: true, headCoachAccounts: true, can: can(list) }).filter((r) => r === "TEACHER" || r === "HEAD_COACH"), []);
  }
});

test("assignable roles: Super Administrator is never offered", () => {
  for (const t of [true, false]) for (const h of [true, false]) {
    assert.ok(!assignableRoles({ teacherAccounts: t, headCoachAccounts: h, can: () => true }).includes("SUPER_ADMIN"));
  }
});

test("role filter tabs: production (LEGACY), UNKNOWN or loading → only the three original roles", () => {
  assert.deepEqual(roleFilterTabs(null).map((t) => t.value), ["", "STUDENT", "MENTOR", "ADMIN"]);
});

test("role filter tabs: a NEW backend adds the roles it lists, in a stable order", () => {
  const all = ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"];
  assert.deepEqual(roleFilterTabs(all).map((t) => t.label), ["All", "Students", "Teachers", "Coaches", "Head Coaches", "Admins", "Super Admins"]);
  assert.deepEqual(roleFilterTabs(["STUDENT", "MENTOR", "ADMIN", "FUTURE_ROLE"]).map((t) => t.value), ["", "STUDENT", "MENTOR", "ADMIN"], "unknown role names ignored");
});

// ─── Action buttons when /me/permissions failed ─────────────────────────────
import { actionAllowed } from "../lib/auth/navigation.ts";

test("an action follows known permissions, waits while loading, and defers to the backend when the list failed", () => {
  const holds = (...ps) => (p) => ps.includes(p);
  assert.equal(actionAllowed("resources.manage", "ready", holds("resources.manage")), true);
  assert.equal(actionAllowed("resources.manage", "ready", holds("resources.view")), false, "a Head Coach reads only");
  assert.equal(actionAllowed("resources.manage", "loading", holds("resources.manage")), false, "no flashing while loading");
  assert.equal(actionAllowed("resources.manage", "error", holds()), true, "list failed: the API decides, as before");
});
