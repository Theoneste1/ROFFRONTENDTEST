// Programme screens: who may change memberships / course access, programme courses, activity, resource confirmation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityBreakdown, canSearchPeople, courseAccessError, courseAccessTarget, memberRolesManaged, membershipError,
  programmeCourses, reportDivisions,
} from "../lib/programmes/programme-rules.ts";
import { resourceSavedMessage, resourceSavedOutcome } from "../lib/mentor/resource-saved.ts";

const can = (list) => (p) => list.includes(p);
// GET /me/permissions lists (backend develop): ADMIN legacy list has no programmes.manageMembers (D-5).
const ADMIN = ["users.manage", "mentorAssignments.manage", "reports.export"];
const SUPER = [...ADMIN, "programmes.manageMembers", "programmes.manageHeads", "users.view"];
const HEAD = ["programmes.manageMembers", "mentorAssignments.manage", "users.view", "reports.view", "activity.view"];
const COACH = ["courses.view", "reviews.grade", "analytics.course"];

test("membership: administrators students and coaches, a Head Coach students only, only with programmes.manageMembers", () => {
  assert.deepEqual(memberRolesManaged("SUPER_ADMIN", can(SUPER)), ["STUDENT", "MENTOR"]);
  assert.deepEqual(memberRolesManaged("HEAD_COACH", can(HEAD)), ["STUDENT"]);
  assert.deepEqual(memberRolesManaged("ADMIN", can(ADMIN)), [], "an ADMIN's /me/permissions does not list it (D-5)");
  assert.deepEqual(memberRolesManaged("MENTOR", can(COACH)), []);
  assert.deepEqual(memberRolesManaged("MENTOR", can(["programmes.manageMembers"])), [], "unknown holder role: nothing");
});

test("people search only with users.manage (a Head Coach's users.view is used by no route)", () => {
  assert.equal(canSearchPeople(can(SUPER)), true);
  assert.equal(canSearchPeople(can(HEAD)), false);
});

test("course access targets follow the backend: coaches by any manager, Head Coaches by administrators only", () => {
  assert.equal(courseAccessTarget("HEAD_COACH", can(HEAD), "MENTOR"), "coach");
  assert.equal(courseAccessTarget("HEAD_COACH", can(HEAD), "HEAD_COACH"), "notEligible");
  assert.equal(courseAccessTarget("ADMIN", can(ADMIN), "HEAD_COACH"), "headCoach");
  assert.equal(courseAccessTarget("SUPER_ADMIN", can(SUPER), "HEAD_COACH"), "headCoach");
  assert.equal(courseAccessTarget("ADMIN", can([]), "HEAD_COACH"), "notEligible", "a DENY override removes it");
  for (const r of ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN", undefined]) assert.equal(courseAccessTarget("ADMIN", can(ADMIN), r), "notEligible", String(r));
  assert.equal(courseAccessTarget("MENTOR", can(COACH), "MENTOR"), "notEligible");
});

test("backend refusals get readable messages; anything else falls back", () => {
  assert.match(courseAccessError("NOT_PROGRAMME_HEAD", 400), /programme they head/);
  assert.match(courseAccessError("SCOPE_FORBIDDEN", 403), /coaches only/);
  assert.match(courseAccessError(undefined, 404), /programme you head/);
  assert.equal(courseAccessError("OTHER", 500), null);
  assert.match(membershipError("ALREADY_MEMBER", 409), /Already/);
  assert.match(membershipError("SCOPE_FORBIDDEN", 403), /administrator/);
  assert.equal(membershipError(undefined, 500), null);
});

const row = (cid, title, did, dname, n) => ({
  course: { id: cid, code: cid.toUpperCase(), title }, division: { id: did, code: dname.toUpperCase(), name: dname },
  students: n, opened: n - 1, completed: 0, participationRate: 0, assignmentsPublished: 1, submissions: 2, studentsSubmitted: 1,
  submissionRate: 0, averageScore: null, discussionThreads: 0, discussionComments: 0,
});

test("programme courses: one entry per course in report order, divisions and totals combined", () => {
  const rows = [row("alg", "Algebra", "j", "Junior", 3), row("alg", "Algebra", "s", "Senior", 2), row("geo", "Geometry", "j", "Junior", 1)];
  const courses = programmeCourses(rows);
  assert.deepEqual(courses.map((c) => c.course.title), ["Algebra", "Geometry"]);
  assert.equal(courses[0].students, 5);
  assert.equal(courses[0].opened, 3);
  assert.equal(courses[0].submissions, 4);
  assert.deepEqual(courses[0].divisions.map((d) => d.division.name), ["Junior", "Senior"]);
  assert.deepEqual(reportDivisions(rows).map((d) => d.id), ["j", "s"]);
  assert.deepEqual(programmeCourses([]), []);
});

test("activity breakdown: non-zero types, largest first, unknown types keep their code", () => {
  assert.deepEqual(activityBreakdown({ LOGIN: 3, COURSE_OPENED: 5, RESULT_VIEWED: 0, NEW_THING: 1 }), [
    { type: "COURSE_OPENED", label: "Courses opened", count: 5 },
    { type: "LOGIN", label: "Sign-ins", count: 3 },
    { type: "NEW_THING", label: "NEW_THING", count: 1 },
  ]);
});

test("resource confirmation: upload / edit, published or not; unknown values show nothing", () => {
  assert.equal(resourceSavedOutcome(false, false), "uploaded");
  assert.equal(resourceSavedOutcome(false, true), "uploaded-published");
  assert.equal(resourceSavedOutcome(true, false), "updated");
  assert.match(resourceSavedMessage("uploaded"), /not published yet/);
  assert.match(resourceSavedMessage("uploaded-published"), /can now see it/);
  for (const v of [null, "", "toString", "x"]) assert.equal(resourceSavedMessage(v), null);
});
