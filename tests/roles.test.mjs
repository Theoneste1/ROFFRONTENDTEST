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

test("Teacher, Head Coach and unknown roles have no portal: always the 'no access' page", () => {
  for (const r of ["TEACHER", "HEAD_COACH", ...UNKNOWN]) {
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
  assert.equal(sharesPortal("STUDENT", "STUDENT"), true);
  assert.equal(sharesPortal("SUPER_ADMIN", "MENTOR"), false);
  assert.equal(sharesPortal("STUDENT", "ADMIN"), false);
  assert.equal(sharesPortal("MENTOR", "ADMIN"), false);
  for (const r of ["TEACHER", "HEAD_COACH", ...UNKNOWN]) {
    for (const gate of ["STUDENT", "MENTOR", "ADMIN"]) assert.equal(sharesPortal(r, gate), false, `${String(r)} @ ${gate}`);
  }
});

test("no redirect loop: a role refused by every gate is sent to a page that is not a portal", () => {
  for (const r of ["TEACHER", "HEAD_COACH", ...UNKNOWN]) {
    const target = portalHome(r);
    assert.equal(target, NO_ACCESS_PATH);
    assert.ok(!target.startsWith("/student") && !target.startsWith("/mentor") && !target.startsWith("/admin"));
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

test("postLoginPath: Teacher, Head Coach and unknown roles always go to the 'no access' page", () => {
  for (const r of ["TEACHER", "HEAD_COACH", ...UNKNOWN]) {
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

test("links: Teacher, Head Coach and unknown roles get nothing to open (no crash)", () => {
  for (const r of ["TEACHER", "HEAD_COACH", ...UNKNOWN]) {
    assert.equal(resolveLink("/assignments/a1", r), null, String(r));
    assert.equal(resolveLink("/student/assignments/a1", r), null, String(r));
    assert.equal(discussionHref(r, "t1"), null, String(r));
    assert.equal(notificationHref({ link: "/discussions/t1", data: null }, r), null, String(r));
    assert.equal(notificationHref({ link: null, data: { threadId: "t1" } }, r), null, String(r));
  }
});

test("deep-link paths are unchanged", () => {
  for (const p of ["/assignments/a1", "/results/s1", "/courses/c1/resources/r1", "/discussions/t1"]) assert.equal(isDeepLinkPath(p), true, p);
  for (const p of ["/admin/users", "/student/dashboard", "/assignments/"]) assert.equal(isDeepLinkPath(p), false, p);
});
