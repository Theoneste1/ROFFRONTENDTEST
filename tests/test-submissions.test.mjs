// Test Management, Phase 2 (lib/test-management/submissions.ts; capability `testSubmissions`, owner-approved plan
// 2026-11-19): menus and page gating, answer formats, the page-by-page upload queue (retry one page), and the extension
// form's checks. The backend remains the authority (database time, every rule).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_RETRIES, MAX_ANSWER_PAGES, TESTS_SUBMIT, TESTS_SUBMIT_FOR_STUDENTS, addPages, answerNavVisible, answerPageMode, answerProblem,
  extensionProblems, formatAllows, newClientKey, nextQueued, pageFileProblem, queueSummary, queueText, removePage, retryFailed, setPage,
  shouldAutoRetry, staffTabVisible, testSubmissionsSupported, uploadKeyStorageKey,
} from "../lib/test-management/submissions.ts";
import { STUDENT_TESTS, TEACHER_NAV, TEACHER_TESTS } from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { answerBase } from "../lib/api/test-submissions.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions"] };
const PHASE1 = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement"] };
const can = (...held) => (p) => held.includes(p);

test("testSubmissions is a known feature; a backend without it shows nothing of Phase 2", () => {
  assert.ok(KNOWN_FEATURES.includes("testSubmissions"));
  assert.equal(testSubmissionsSupported(HAS), true);
  for (const d of [PHASE1, { state: "LEGACY" }, { state: "UNKNOWN", reason: "timeout" }, undefined, null]) assert.equal(testSubmissionsSupported(d), false);
  assert.equal(staffTabVisible(HAS, true), true);
  assert.equal(staffTabVisible(PHASE1, true), false);
  assert.equal(staffTabVisible(HAS, false), false);
});

test("menus: students (tests.submit) and teachers (tests.submitForStudents), with the feature; never in the frozen teacher menu", () => {
  assert.deepEqual([STUDENT_TESTS.href, STUDENT_TESTS.permission], ["/student/tests", TESTS_SUBMIT]);
  assert.deepEqual([TEACHER_TESTS.href, TEACHER_TESTS.permission], ["/teacher/tests", TESTS_SUBMIT_FOR_STUDENTS]);
  assert.ok(!TEACHER_NAV.some((i) => i.href === "/teacher/tests"));
  assert.equal(answerNavVisible(HAS, new Set(["tests.submit"]), TESTS_SUBMIT), true);
  assert.equal(answerNavVisible(HAS, new Set(["submissions.submit"]), TESTS_SUBMIT), false);
  assert.equal(answerNavVisible(HAS, null, TESTS_SUBMIT), false);
  assert.equal(answerNavVisible(PHASE1, new Set(["tests.submitForStudents"]), TESTS_SUBMIT_FOR_STUDENTS), false);
});

test("answer page mode", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can("tests.submit"), permission: TESTS_SUBMIT };
  assert.equal(answerPageMode({ ...base, detectionLoading: true }), "loading");
  assert.equal(answerPageMode({ ...base, detection: PHASE1 }), "unsupported");
  assert.equal(answerPageMode({ ...base, permissionsStatus: "error" }), "error");
  assert.equal(answerPageMode({ ...base, can: can() }), "forbidden");
  assert.equal(answerPageMode(base), "visible");
});

test("answer formats: what each allows and what blocks a submission", () => {
  assert.deepEqual(formatAllows("UPLOAD_ONLY"), { typed: false, upload: true });
  assert.deepEqual(formatAllows("TYPED_ONLY"), { typed: true, upload: false });
  assert.deepEqual(formatAllows("BOTH"), { typed: true, upload: true });
  assert.equal(answerProblem("UPLOAD_ONLY", "", 0), "Upload at least one page.");
  assert.equal(answerProblem("UPLOAD_ONLY", "", 2), null);
  assert.equal(answerProblem("TYPED_ONLY", "   ", 0), "Type your answer.");
  assert.equal(answerProblem("TYPED_ONLY", "x = 2", 0), null);
  assert.equal(answerProblem("BOTH", "", 0), "Type an answer or upload at least one page.");
  assert.equal(answerProblem("BOTH", "", 1), null);
  assert.match(answerProblem("BOTH", "x".repeat(50_001), 0), /longer than/);
});

test("page files: PDF or images, not empty, at most 20 MB", () => {
  assert.equal(pageFileProblem({ name: "IMG_0001.JPG", size: 1000 }), null);
  assert.equal(pageFileProblem({ name: "scan.pdf", size: 1000 }), null);
  assert.equal(pageFileProblem({ name: "photo.heic", size: 1000 }), null);
  assert.match(pageFileProblem({ name: "notes.docx", size: 1000 }), /PDF or a photo/);
  assert.match(pageFileProblem({ name: "a.png", size: 0 }), /empty/);
  assert.match(pageFileProblem({ name: "a.png", size: 21 * 1024 * 1024 }), /20 MB/);
});

test("the queue: pages numbered in order, sent one at a time; a failed page is retried alone", () => {
  let { items, refused } = addPages([], [{ name: "p1.jpg", size: 10 }, { name: "p2.jpg", size: 20 }, { name: "p3.pdf", size: 30 }]);
  assert.equal(refused, 0);
  assert.deepEqual(items.map((x) => [x.page, x.name, x.status]), [[1, "p1.jpg", "queued"], [2, "p2.jpg", "queued"], [3, "p3.pdf", "queued"]]);
  assert.equal(new Set(items.map((x) => x.id)).size, 3);
  assert.equal(nextQueued(items).page, 1);
  items = setPage(items, 1, { status: "done" });
  items = setPage(items, 2, { status: "failed", error: "Cannot reach the server." });
  assert.equal(nextQueued(items).page, 3);   // the failed page waits for its Retry; the others carry on
  items = setPage(items, 3, { status: "done" });
  assert.deepEqual(queueSummary(items), { total: 3, done: 2, failed: 1, busy: false, ready: false });
  assert.equal(queueText(items), "2 of 3 pages uploaded — 1 failed: retry it.");
  items = retryFailed(items, 2);
  assert.deepEqual([nextQueued(items).page, nextQueued(items).status], [2, "queued"]);
  items = setPage(items, 2, { status: "done" });
  assert.equal(queueSummary(items).ready, true);
  assert.equal(queueText(items), "3 of 3 pages uploaded.");
});

test("the queue: never more than 30 pages", () => {
  const many = Array.from({ length: MAX_ANSWER_PAGES + 2 }, (_, i) => ({ name: `${i}.jpg`, size: 1 }));
  const r = addPages([], many);
  assert.deepEqual([r.items.length, r.refused], [MAX_ANSWER_PAGES, 2]);
});

test("removing a page renumbers the later ones, which are sent again; the old last page is removed on the server", () => {
  let { items } = addPages([], [{ name: "a", size: 1 }, { name: "b", size: 1 }, { name: "c", size: 1 }]);
  items = items.map((x) => ({ ...x, status: "done" }));
  const r = removePage(items, 1);
  assert.deepEqual(r.items.map((x) => [x.page, x.name, x.status]), [[1, "b", "queued"], [2, "c", "queued"]]);
  assert.equal(r.deleteOnServer, 3);
  // Removing the last, never-uploaded page: nothing to delete on the server.
  const q = addPages([], [{ name: "a", size: 1 }, { name: "b", size: 1 }]).items.map((x, i) => ({ ...x, status: i === 0 ? "done" : "queued" }));
  assert.deepEqual(removePage(q, 2), { items: [q[0]], deleteOnServer: null });
});

test("a weak connection: network errors and server trouble retry automatically, twice; a refusal never does", () => {
  assert.equal(shouldAutoRetry({ status: 0 }, 0), true);
  assert.equal(shouldAutoRetry({ status: 503 }, 1), true);
  assert.equal(shouldAutoRetry({ status: 0 }, AUTO_RETRIES), false);
  for (const status of [400, 403, 409, 413, 415]) assert.equal(shouldAutoRetry({ status }, 0), false);
});

test("an attempt's key: a UUID, remembered per test and student", () => {
  assert.match(newClientKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newClientKey(), newClientKey());
  assert.equal(uploadKeyStorageKey("t1", null), "rof.testUpload.t1.me");
  assert.equal(uploadKeyStorageKey("t1", "s9"), "rof.testUpload.t1.s9");
  assert.equal(answerBase({ testId: "t1", studentId: null }), "/me/tests/t1");
  assert.equal(answerBase({ testId: "t1", studentId: "s9" }), "/teacher/tests/t1/students/s9");
});

test("extension form: target, a deadline after the test's own and in the future, a reason", () => {
  const closes = "2026-12-10T10:00:00.000Z";
  const now = Date.parse("2026-12-11T10:00:00.000Z");
  const ok = { kind: "STUDENT", targetId: "s1", newDeadline: "2026-12-12T09:00", reason: "Power cut" };
  assert.deepEqual(extensionProblems(ok, closes, now), {});
  assert.deepEqual(Object.keys(extensionProblems({ ...ok, targetId: "" }, closes, now)), ["targetId"]);
  assert.deepEqual(Object.keys(extensionProblems({ ...ok, kind: "TEST", targetId: "" }, closes, now)), []);
  assert.match(extensionProblems({ ...ok, newDeadline: "2026-12-09T09:00" }, closes, now).newDeadline, /after the test's own/);
  assert.match(extensionProblems({ ...ok, newDeadline: "2026-12-11T08:00" }, closes, now).newDeadline, /future/);
  assert.match(extensionProblems({ ...ok, reason: " x " }, closes, now).reason, /3–500/);
  assert.deepEqual(extensionProblems({ ...ok, targetId: "" }, closes, now, { editing: true }), {});
});
