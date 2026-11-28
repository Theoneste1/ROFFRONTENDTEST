// Page help (owner, 2026-11-26; lib/help): the role's guide, the topic of each page, every portal page covered,
// ROF's official support (platform settings) and neutral ROF branding — no personal name or number (owner, 2026-11-28).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  HELP_CREDIT, generalTopic, guideFileName, guideFor, guidePagePath, guideShown, guideUrl, helpRoleOf, matchScore, roleFromGuideFile, searchTopics,
  topicFor, whatsappNumber, whatsappUrl,
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

test("ROF support: WhatsApp with the official support phone (platform settings), the page named in the first message", () => {
  assert.equal(HELP_CREDIT, "ROF LMS · Rwanda Olympiad Foundation");
  for (const phone of ["0788 123 456", "+250 788 123 456", "250788123456", "+250788123456"]) assert.equal(whatsappNumber(phone), "250788123456", phone);
  assert.equal(whatsappNumber("+44 20 7946 0958"), "442079460958");
  for (const none of [null, undefined, "", "   ", "call us", "12345"]) assert.equal(whatsappNumber(none), null, String(none));
  const url = whatsappUrl("0788 123 456", "Marking");
  assert.ok(url.startsWith("https://wa.me/250788123456?text="));
  assert.equal(decodeURIComponent(url.split("text=")[1]), "Hello ROF support, I need help with ROF LMS (page: Marking).");
  assert.equal(decodeURIComponent(whatsappUrl("0788 123 456").split("text=")[1]), "Hello ROF support, I need help with ROF LMS.");
  assert.equal(whatsappUrl(null, "Marking"), null, "no support phone: no WhatsApp link (the Support page instead)");
});

test("no personal name or personal number anywhere in help: neutral ROF branding (owner, 2026-11-28)", () => {
  const files = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(join("lib", "help")); walk(join("app", "components", "help")); walk(join("app", "help"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const personal of ["Theoneste", "Technology lead", "0780 850 611", "0780850611", "250780850611"]) assert.ok(!src.includes(personal), `${f} mentions ${personal}`);
  }
  for (const role of ROLES) {
    for (const t of [...guideFor(role).gettingStarted, ...guideFor(role).topics]) assert.doesNotMatch(JSON.stringify(t), /Theoneste|Technology lead/, `${role}: ${t.id}`);
  }
});

test("PDF file name and address per audience", () => {
  assert.equal(guideUrl("HEAD_COACH"), "/help/guide/head-coaches.pdf");
  assert.equal(guideUrl("SUPER_ADMIN"), "/help/guide/super-administrators.pdf");
  for (const role of ROLES) assert.equal(roleFromGuideFile(guideUrl(role).replace("/help/guide/", "")), role);
  assert.equal(roleFromGuideFile("../etc/passwd"), null);
  assert.equal(roleFromGuideFile("coaches"), null);
  assert.equal(guideFileName("HEAD_COACH"), "ROF-LMS-guide-Head-Coaches.pdf");
  assert.equal(guideFileName("STUDENT"), "ROF-LMS-guide-Students.pdf");
});

test("the user guide inside the system: one page per portal, a section link per topic, and the page has its own topic", () => {
  assert.deepEqual(ROLES.map((r) => guidePagePath(r)), ["/student/guide", "/teacher/guide", "/mentor/guide", "/mentor/guide", "/admin/guide", "/admin/guide"]);
  assert.equal(guidePagePath("COACH", "coach-marking"), "/mentor/guide#coach-marking");
  for (const role of ROLES) {
    assert.equal(topicFor(role, guidePagePath(role))?.id, "user-guide", role);
    for (const t of [...guideFor(role).gettingStarted, ...guideFor(role).topics]) assert.match(t.id, /^[a-z0-9-]+$/, `${role}: ${t.id} is a usable section link`);
  }
  assert.doesNotMatch(generalTopic("STUDENT").steps.join(" "), /Download/, "the general help points to the guide inside the system");
});

test("which guide the page shows: your own; Administrators and Super Administrators may open any role's", () => {
  for (const reader of ["STUDENT", "TEACHER", "COACH", "HEAD_COACH"]) {
    assert.equal(guideShown(reader, "ADMIN"), reader, `${reader} never reads another role's guide`);
    assert.equal(guideShown(reader, null), reader);
  }
  for (const reader of ["ADMIN", "SUPER_ADMIN"]) {
    for (const r of ROLES) assert.equal(guideShown(reader, r), r);
    assert.equal(guideShown(reader, "NOT_A_ROLE"), reader);
    assert.equal(guideShown(reader, undefined), reader);
  }
});

test("searching the guide: every word must appear (title, summary, steps or tips), in any case and order", () => {
  const topics = guideFor("STUDENT").topics;
  assert.equal(searchTopics(topics, "").length, topics.length);
  assert.equal(searchTopics(topics, "   ").length, topics.length);
  const pw = searchTopics(guideFor("STUDENT").gettingStarted, "PASSWORD forgot");
  assert.ok(pw.some((t) => t.id === "forgot-password" || /forgot/i.test(t.title)), "finds the forgotten-password topic");
  assert.deepEqual(searchTopics(topics, "zzqx-nothing-matches"), []);
  for (const t of searchTopics(topics, "leaderboard")) assert.match([t.title, t.summary, ...(t.steps ?? []), ...(t.tips ?? [])].join(" ").toLowerCase(), /leaderboard/);
});
