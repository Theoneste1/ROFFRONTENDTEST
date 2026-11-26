// Page help (owner, 2026-11-26; lib/help): the role's guide, the topic of each page, every portal page covered,
// the technical support link (WhatsApp 0780 850 611) and the credit "Made by Theoneste, Technology lead".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  HELP_CREDIT, TECH_SUPPORT, generalTopic, guideFileName, guideFor, guideUrl, helpRoleOf, matchScore, roleFromGuideFile, shouldAutoOpen,
  topicFor, whatsappUrl,
} from "@/lib/help/rules";
import { ADMIN_NAV, MENTOR_NAV, TEACHER_NAV, ADMIN_TESTS, ADMIN_FORMS, ADMIN_COUNTRIES, ADMIN_SUBSCRIBERS, ADMIN_SETTINGS,
  ADMIN_TEACHER_APPLICATIONS, ADMIN_NOTIFICATION_DELIVERIES, ADMIN_REGISTRATION_DATA, ADMIN_MARKING_OVERVIEW, ADMIN_TEST_REPORTS,
  MENTOR_TESTS, MENTOR_MARKING, MENTOR_MARKING_OVERVIEW, MENTOR_STUDENTS, MENTOR_RESULTS, MENTOR_TEST_REPORTS, MENTOR_SHARED_REPORTS,
  STUDENT_TESTS, STUDENT_RESULTS, TEACHER_TESTS, TEACHER_RESULTS, TEACHER_SHARED_REPORTS } from "@/lib/auth/navigation";

const ROLES = ["STUDENT", "TEACHER", "COACH", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"];

test("account roles map to guides; unknown roles get no help button", () => {
  assert.deepEqual(["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"].map(helpRoleOf), ROLES);
  assert.equal(helpRoleOf("OWNER"), null);
  assert.equal(helpRoleOf(null), null);
});

test("every guide starts from opening the website and signing in, and its topic ids are unique", () => {
  for (const role of ROLES) {
    const g = guideFor(role);
    assert.deepEqual(g.gettingStarted.slice(0, 2).map((t) => t.id), ["start-open", "start-sign-in"], role);
    const ids = g.topics.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, `${role}: duplicate topic id`);
    for (const t of [...g.gettingStarted, ...g.topics]) {
      assert.ok(t.title && t.summary, `${role} ${t.id}: title and summary`);
      for (const step of t.steps ?? []) assert.ok(step.length > 5, `${role} ${t.id}: empty step`);
    }
  }
});

test("the most specific pattern wins; '*' stands for one segment", () => {
  assert.equal(matchScore("/mentor/marking", "/mentor/marking/7MX2-97NP"), 22);
  assert.equal(matchScore("/mentor/marking", "/mentor/markingx"), -1);
  assert.ok(matchScore("/admin/users/bulk", "/admin/users/bulk") > matchScore("/admin/users/*", "/admin/users/bulk"));
  assert.equal(topicFor("COACH", "/mentor/marking/7MX2-97NP").id, "coach-marking");
  assert.equal(topicFor("COACH", "/mentor/marking/q/7MX2-97NP/q2").id, "coach-question-marking");
  assert.equal(topicFor("COACH", "/mentor/assignments/create").id, "coach-assignments");
  assert.equal(topicFor("COACH", "/mentor/assignments/a1/assignmentReview/s9").id, "coach-reviews");
  assert.equal(topicFor("ADMIN", "/admin/users/u1").id, "admin-user");
  assert.equal(topicFor("ADMIN", "/admin/users/bulk").id, "admin-bulk");
  assert.equal(topicFor("ADMIN", "/admin/unknown-page"), null);
  assert.equal(topicFor("STUDENT", "/student/assignments/results").id, "student-assignment-results");
  assert.equal(topicFor("STUDENT", "/student/assignments/a1").id, "student-assignments");
  assert.equal(topicFor("SUPER_ADMIN", "/admin/registration-data").id, "admin-registration-data");
  assert.equal(topicFor("ADMIN", "/admin/registration-data"), null);   // Super Administrators only
  assert.equal(generalTopic("TEACHER").id, "general");
});

test("every menu item of every portal has its help topic", () => {
  const menus = {
    ADMIN: [...ADMIN_NAV, ADMIN_TESTS, ADMIN_FORMS, ADMIN_COUNTRIES, ADMIN_SUBSCRIBERS, ADMIN_SETTINGS, ADMIN_TEACHER_APPLICATIONS,
      ADMIN_NOTIFICATION_DELIVERIES, ADMIN_MARKING_OVERVIEW, ADMIN_TEST_REPORTS],
    SUPER_ADMIN: [ADMIN_REGISTRATION_DATA],
    COACH: [...MENTOR_NAV.filter((i) => i.href !== "/mentor/programme"), MENTOR_MARKING, MENTOR_STUDENTS, MENTOR_RESULTS, MENTOR_SHARED_REPORTS],
    HEAD_COACH: [...MENTOR_NAV, MENTOR_TESTS, MENTOR_MARKING_OVERVIEW, MENTOR_TEST_REPORTS, MENTOR_SHARED_REPORTS],
    TEACHER: [...TEACHER_NAV, TEACHER_TESTS, TEACHER_RESULTS, TEACHER_SHARED_REPORTS],
    STUDENT: ["/student/dashboard", "/student/leaderboard", "/student/courses", "/student/resources", "/student/assignments",
      "/student/assignments/results"].map((href) => ({ href })).concat([STUDENT_TESTS, STUDENT_RESULTS]),
  };
  for (const [role, items] of Object.entries(menus)) {
    for (const item of items) assert.ok(topicFor(role, item.href), `${role}: no help for ${item.href}`);
  }
});

/** Every page.tsx of the four portals (except the unsupported legacy pages) is explained for its portal's role. */
test("every portal page is covered by a help topic", () => {
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!name.startsWith("_") && name !== "components") walk(p); }
      else if (name === "page.tsx") pages.push(dir.replace(/\\/g, "/").replace(/^app/, "").replace(/\[[^\]]+\]/g, "x"));
    }
  };
  for (const portal of ["student", "teacher", "mentor", "admin"]) walk(join("app", portal));
  const roleOf = { student: ["STUDENT"], teacher: ["TEACHER"], mentor: ["COACH", "HEAD_COACH"], admin: ["ADMIN", "SUPER_ADMIN"] };
  const missing = [];
  for (const path of pages) {
    const portal = path.split("/")[1];
    if (path === `/${portal}`) continue;   // the portal root redirects to its first page
    if (!roleOf[portal].some((r) => topicFor(r, path))) missing.push(path);
  }
  assert.deepEqual(missing, []);
});

test("technical support: Theoneste on WhatsApp 0780 850 611, with the page named in the first message", () => {
  assert.equal(TECH_SUPPORT.whatsappNumber, "250780850611");
  assert.equal(HELP_CREDIT, "Made by Theoneste, Technology lead");
  const url = whatsappUrl("Marking");
  assert.ok(url.startsWith("https://wa.me/250780850611?text="));
  assert.equal(decodeURIComponent(url.split("text=")[1]), "Hello Theoneste, I need help with ROF LMS (page: Marking).");
  assert.equal(decodeURIComponent(whatsappUrl().split("text=")[1]), "Hello Theoneste, I need help with ROF LMS.");
});

test("PDF file name and address per audience; the panel opens by itself once per topic", () => {
  assert.equal(guideUrl("HEAD_COACH"), "/help/guide/head-coaches.pdf");
  assert.equal(guideUrl("SUPER_ADMIN"), "/help/guide/super-administrators.pdf");
  for (const role of ROLES) assert.equal(roleFromGuideFile(guideUrl(role).replace("/help/guide/", "")), role);
  assert.equal(roleFromGuideFile("../etc/passwd"), null);
  assert.equal(roleFromGuideFile("coaches"), null);
  assert.equal(guideFileName("HEAD_COACH"), "ROF-LMS-guide-Head-Coaches.pdf");
  assert.equal(guideFileName("STUDENT"), "ROF-LMS-guide-Students.pdf");
  assert.equal(shouldAutoOpen([], "coach-marking"), true);
  assert.equal(shouldAutoOpen(["coach-marking"], "coach-marking"), false);
});
