// Bulk e-mail composer, permission-override rules and activity filters
// (lib/admin-ops/*.ts), and the new admin menu items (lib/auth/navigation.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { EMAIL_ROLES, EMAIL_RULES, buildSendPayload, canRetryJob, emailErrorMessage, isJobRunning, newIdempotencyKey, validateComposer } from "../lib/admin-ops/email.ts";
import { buildOverridePayload, grantNeedsCourseDivision, overrideErrorMessage, overrideOptions, overrideState, overrideTargetRefusal } from "../lib/admin-ops/overrides.ts";
import { ACTIVITY_TYPES, activityQuery, dayToIso } from "../lib/admin-ops/activity.ts";
import { ApiError } from "../lib/api/errors.ts";
import { ADMIN_NAV, visibleNav } from "../lib/auth/navigation.ts";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const base = { subject: "Exam timetable", body: "The timetable is attached below.", mode: "ROLE", role: "STUDENT", divisionId: "", schoolId: "", userIds: [], confirmAll: false };

// ─── E-mail ─────────────────────────────────────────────────────────────────

test("e-mail: only the roles the API accepts are offered", () => {
  assert.deepEqual([...EMAIL_ROLES], ["STUDENT", "MENTOR", "ADMIN"]);
  assert.ok(validateComposer({ ...base, role: "TEACHER" }).recipients);
  assert.ok(validateComposer({ ...base, role: "SUPER_ADMIN" }).recipients);
  assert.deepEqual(validateComposer(base), {});
});

test("e-mail: subject and body limits follow the DTO (after trimming)", () => {
  assert.ok(validateComposer({ ...base, subject: " a " }).subject);
  assert.ok(validateComposer({ ...base, subject: "x".repeat(EMAIL_RULES.subject.max + 1) }).subject);
  assert.equal(validateComposer({ ...base, subject: "ok" }).subject, undefined);
  assert.ok(validateComposer({ ...base, body: "  hi   " }).body);
  assert.ok(validateComposer({ ...base, body: "x".repeat(10_001) }).body);
  assert.equal(validateComposer({ ...base, body: "x".repeat(10_000) }).body, undefined);
});

test("e-mail: every recipient mode needs its own selection; ALL needs explicit confirmation", () => {
  assert.ok(validateComposer({ ...base, mode: "DIVISION" }).recipients);
  assert.deepEqual(validateComposer({ ...base, mode: "DIVISION", divisionId: U1 }), {});
  assert.ok(validateComposer({ ...base, mode: "SCHOOL" }).recipients);
  assert.deepEqual(validateComposer({ ...base, mode: "SCHOOL", schoolId: U1 }), {});
  assert.ok(validateComposer({ ...base, mode: "EXPLICIT" }).recipients);
  assert.ok(validateComposer({ ...base, mode: "EXPLICIT", userIds: Array.from({ length: 501 }, (_, i) => String(i)) }).recipients);
  assert.deepEqual(validateComposer({ ...base, mode: "EXPLICIT", userIds: [U1] }), {});
  assert.ok(validateComposer({ ...base, mode: "ALL" }).recipients);
  assert.deepEqual(validateComposer({ ...base, mode: "ALL", confirmAll: true }), {});
  assert.ok(validateComposer({ ...base, mode: "NOPE" }).recipients);
});

test("e-mail: the payload carries only the chosen mode's field, trimmed text and the key", () => {
  const key = "email-abcdefgh";
  assert.deepEqual(buildSendPayload({ ...base, subject: "  Hi  ", body: " Hello all \n", divisionId: U1, schoolId: U2, userIds: [U1] }, key), {
    idempotencyKey: key,
    recipientMode: "ROLE",
    subject: "Hi",
    body: "Hello all",
    recipientRole: "STUDENT",
  });
  assert.deepEqual(buildSendPayload({ ...base, mode: "DIVISION", divisionId: U1 }, key).recipientDivisionId, U1);
  assert.deepEqual(buildSendPayload({ ...base, mode: "SCHOOL", schoolId: U2 }, key).recipientSchoolId, U2);
  assert.deepEqual(buildSendPayload({ ...base, mode: "EXPLICIT", userIds: [U1, U2, U1] }, key).recipientUserIds, [U1, U2]);
  const all = buildSendPayload({ ...base, mode: "ALL", confirmAll: true }, key);
  assert.deepEqual(Object.keys(all).sort(), ["body", "idempotencyKey", "recipientMode", "subject"]);
});

test("e-mail: idempotency keys are unique and within the DTO's 8–128 characters", () => {
  const a = newIdempotencyKey();
  const b = newIdempotencyKey();
  assert.notEqual(a, b);
  for (const k of [a, b]) assert.ok(k.length >= EMAIL_RULES.idempotencyKey.min && k.length <= EMAIL_RULES.idempotencyKey.max, k);
  assert.equal(newIdempotencyKey(() => "fixed"), "email-fixed");
});

test("e-mail: job state helpers and refusal messages", () => {
  assert.equal(isJobRunning("PENDING"), true);
  assert.equal(isJobRunning("IN_PROGRESS"), true);
  assert.equal(isJobRunning("PARTIAL_FAILURE"), false);
  assert.equal(canRetryJob({ status: "PARTIAL_FAILURE", failedCount: 2 }), true);
  assert.equal(canRetryJob({ status: "FAILED", failedCount: 3 }), true);
  assert.equal(canRetryJob({ status: "COMPLETED", failedCount: 0 }), false);
  assert.equal(canRetryJob({ status: "IN_PROGRESS", failedCount: 1 }), false);
  assert.match(emailErrorMessage(new ApiError(400, "NO_RECIPIENTS", "x")), /Nobody matches/);
  assert.match(emailErrorMessage(new ApiError(400, "RECIPIENTS_NOT_FOUND", "x")), /no longer receive/);
  assert.match(emailErrorMessage(new ApiError(409, "INVALID_STATE_TRANSITION", "x")), /still being sent/);
  assert.match(emailErrorMessage(new ApiError(403, "FORBIDDEN", "x")), /email\.bulkSend/);
  assert.equal(emailErrorMessage(new ApiError(500, "ERROR", "x")), null);
  assert.equal(emailErrorMessage(new Error("x")), null);
});

// ─── Permission overrides ───────────────────────────────────────────────────

const catalogue = {
  permissions: ["courses.view", "reviews.grade", "assignments.prepare", "students.viewProfile", "permissions.view", "audit.view"],
  roles: {
    MENTOR: { label: "Coach", grants: { "reviews.grade": "courseDivision", "courses.view": "courseDivision" } },
    TEACHER: { label: "Teacher", grants: { "courses.view": "school" } },
    ADMIN: { label: "Administrator", grants: { "audit.view": "global", "permissions.view": "global" } },
    SUPER_ADMIN: { label: "Super Administrator", grants: { "audit.view": "global" } },
  },
  overridePolicy: {
    grantable: { TEACHER: ["assignments.prepare", "students.viewProfile", "permissions.view"] },
    deniableRoles: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN"],
    neverGrantable: ["reviews.grade", "permissions.view"],
  },
};

test("overrides: options follow the policy for the target's role", () => {
  assert.deepEqual(overrideOptions(catalogue, "MENTOR", "DENY"), ["courses.view", "reviews.grade"]);
  assert.deepEqual(overrideOptions(catalogue, "MENTOR", "GRANT"), []);
  assert.deepEqual(overrideOptions(catalogue, "TEACHER", "GRANT"), ["assignments.prepare", "students.viewProfile"], "never-grantable is excluded");
  assert.deepEqual(overrideOptions(catalogue, "SUPER_ADMIN", "DENY"), []);
  assert.deepEqual(overrideOptions(catalogue, "GUEST", "DENY"), []);
});

test("overrides: no override on yourself or on a Super Administrator", () => {
  assert.match(overrideTargetRefusal({ id: U1, role: "MENTOR" }, U1), /your own account/);
  assert.match(overrideTargetRefusal({ id: U2, role: "SUPER_ADMIN" }, U1), /Super Administrator/);
  assert.equal(overrideTargetRefusal({ id: U2, role: "MENTOR" }, U1), null);
});

test("overrides: state is revoked, expired or active", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  assert.equal(overrideState({ revokedAt: "2026-05-01T00:00:00Z", expiresAt: null }, now), "REVOKED");
  assert.equal(overrideState({ revokedAt: null, expiresAt: "2026-05-01T00:00:00Z" }, now), "EXPIRED");
  assert.equal(overrideState({ revokedAt: null, expiresAt: "2026-07-01T00:00:00Z" }, now), "ACTIVE");
  assert.equal(overrideState({ revokedAt: null, expiresAt: null }, now), "ACTIVE");
});

test("overrides: payload — DENY has no scope; a non-delegation GRANT needs course × division", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  const deny = buildOverridePayload({ effect: "DENY", permission: "reviews.grade", reason: "  On leave  ", expiresOn: "", courseId: U1, divisionId: U2 }, now);
  assert.deepEqual(deny, { ok: true, payload: { permission: "reviews.grade", effect: "DENY", reason: "On leave" } });
  assert.equal(grantNeedsCourseDivision("GRANT", "students.viewProfile"), false);
  assert.equal(grantNeedsCourseDivision("GRANT", "assignments.prepare"), true);
  assert.equal(grantNeedsCourseDivision("DENY", "assignments.prepare"), false);
  const grant = buildOverridePayload({ effect: "GRANT", permission: "assignments.prepare", reason: "Help", expiresOn: "", courseId: "", divisionId: "" }, now);
  assert.equal(grant.ok, false);
  const grantOk = buildOverridePayload({ effect: "GRANT", permission: "assignments.prepare", reason: "Help", expiresOn: "2026-06-30", courseId: U1, divisionId: U2 }, now);
  assert.equal(grantOk.ok, true);
  assert.equal(grantOk.payload.courseId, U1);
  assert.equal(grantOk.payload.divisionId, U2);
  assert.ok(grantOk.payload.expiresAt && Date.parse(grantOk.payload.expiresAt) > now);
});

test("overrides: payload validation — permission, reason length, future end date", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  const f = { effect: "DENY", permission: "reviews.grade", reason: "Reason", expiresOn: "", courseId: "", divisionId: "" };
  assert.match(buildOverridePayload({ ...f, permission: "" }, now).error, /Choose a permission/);
  assert.match(buildOverridePayload({ ...f, reason: " a " }, now).error, /reason/);
  assert.match(buildOverridePayload({ ...f, reason: "x".repeat(501) }, now).error, /reason/);
  assert.match(buildOverridePayload({ ...f, expiresOn: "2026-05-31" }, now).error, /future/);
  assert.match(buildOverridePayload({ ...f, expiresOn: "2026-13-45" }, now).error, /valid date|future/);
});

test("overrides: backend refusals become clear messages", () => {
  const notAllowed = (reason) => new ApiError(400, "OVERRIDE_NOT_ALLOWED", `This override is not allowed: ${reason}.`, { reason });
  assert.match(overrideErrorMessage(new ApiError(403, "OVERRIDE_NOT_ALLOWED", "x", { reason: "self" })), /your own account/);
  assert.match(overrideErrorMessage(notAllowed("no override applies to a Super Administrator")), /Super Administrator/);
  assert.match(overrideErrorMessage(notAllowed("never grantable")), /never be granted/);
  assert.match(overrideErrorMessage(notAllowed("not a default permission of this role")), /nothing to deny/);
  assert.match(overrideErrorMessage(notAllowed("outside the user’s existing scope (no active teacher assignment)")), /existing scope/);
  assert.equal(overrideErrorMessage(notAllowed("something new")), "This override is not allowed: something new.");
  assert.match(overrideErrorMessage(new ApiError(409, "OVERRIDE_EXISTS", "x")), /identical active override/);
  assert.match(overrideErrorMessage(new ApiError(409, "OVERRIDE_ALREADY_REVOKED", "x")), /already been revoked/);
  assert.match(overrideErrorMessage(new ApiError(403, "FORBIDDEN", "x")), /Only a Super Administrator/);
  assert.equal(overrideErrorMessage(new ApiError(500, "ERROR", "x")), null);
});

// ─── Activity ───────────────────────────────────────────────────────────────

test("activity: the type list is the backend's ActivityType enum", () => {
  assert.deepEqual([...ACTIVITY_TYPES], ["LOGIN", "COURSE_OPENED", "COURSE_COMPLETED", "RESOURCE_VIEWED", "ASSIGNMENT_VIEWED", "SUBMISSION_CREATED", "SUBMISSION_RESUBMITTED", "RESULT_VIEWED", "THREAD_CREATED", "COMMENT_POSTED"]);
});

test("activity: dates become ISO day edges; invalid filters are dropped, not sent", () => {
  const from = dayToIso("2026-03-01", "start");
  const to = dayToIso("2026-03-01", "end");
  assert.ok(from && to && Date.parse(to) - Date.parse(from) === 86_400_000 - 1);
  assert.equal(dayToIso("01/03/2026", "start"), undefined);
  const q = activityQuery({ userId: "not-a-uuid", courseId: U1, type: "HACK", from: "2026-03-01", to: "nope", page: "0" });
  assert.deepEqual(Object.keys(q).sort(), ["courseId", "from", "limit", "page"]);
  assert.equal(q.page, 1);
  assert.deepEqual(activityQuery({ userId: U2, type: "LOGIN", page: "3" }, 10), { page: 3, limit: 10, userId: U2, type: "LOGIN" });
});

// ─── Navigation ─────────────────────────────────────────────────────────────

test("menu: Activity and E-mail need their permissions (hidden for a coach's list)", () => {
  const hrefs = (items) => items.map((i) => i.href);
  assert.equal(ADMIN_NAV.find((i) => i.href === "/admin/activity")?.permission, "activity.view");
  assert.equal(ADMIN_NAV.find((i) => i.href === "/admin/email")?.permission, "email.bulkSend");
  const coach = new Set(["courses.view", "resources.view", "resources.manage", "assignments.view", "assignments.prepare", "reviews.grade", "analytics.course"]);
  const shown = hrefs(visibleNav(ADMIN_NAV, coach));
  assert.ok(!shown.includes("/admin/activity") && !shown.includes("/admin/email"));
  const noMail = hrefs(visibleNav(ADMIN_NAV, new Set(["activity.view"])));
  assert.ok(noMail.includes("/admin/activity") && !noMail.includes("/admin/email"));
});
