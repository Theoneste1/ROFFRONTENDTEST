// Bulk actions on any record type (lib/admin/bulk-records.ts): availability, the record types the server offers,
// the selection, the confirmation rules, the execute body, refusals and how records are summarised.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAX_IDS,
  EMPTY_CONFIRM,
  bulkFilterFrom,
  countNoun,
  entityTypeInfo,
  genericBulkAvailable,
  idsSelection,
  itemSummary,
  recordActionDanger,
  recordActionLabel,
  recordBulkError,
  recordConfirmProblems,
  recordExecuteBody,
  recordItemCodeLabel,
  recordSelectionSummary,
  recordSummary,
  recordTypeLabel,
  toggleRecord,
  toggleRecordPage,
} from "../lib/admin/bulk-records.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["bulkOperationsGeneric"] };
const can = (...held) => (p) => held.includes(p);

test("available only with the backend feature and users.bulkManage", () => {
  assert.equal(genericBulkAvailable(HAS, can("users.bulkManage")), true);
  assert.equal(genericBulkAvailable(HAS, can()), false);
  assert.equal(genericBulkAvailable({ ...HAS, features: ["bulkUserOperations"] }, can("users.bulkManage")), false);
  assert.equal(genericBulkAvailable(null, can("users.bulkManage")), false);
});

test("a record type is offered only when the server lists at least one action for it", () => {
  const view = {
    gate: "users.bulkManage",
    entityTypes: [
      { entityType: "SCHOOL", maxIds: 1000, maxSelection: 10000, export: null, actions: [{ action: "activate", permissions: [], requiresReason: true, consequence: "c" }] },
      { entityType: "USER", maxIds: 1000, maxSelection: 50000, export: { permission: "users.export" }, actions: [] },
    ],
  };
  assert.equal(entityTypeInfo(view, "SCHOOL")?.entityType, "SCHOOL");
  assert.equal(entityTypeInfo(view, "USER"), null);
  assert.equal(entityTypeInfo(view, "COACH_APPLICATION"), null);
  assert.equal(entityTypeInfo(null, "SCHOOL"), null);
});

test("names and labels", () => {
  assert.equal(countNoun("SCHOOL", 1), "1 school");
  assert.equal(countNoun("SCHOOL_AFFILIATION", 3), "3 school claims");
  assert.equal(countNoun("SOMETHING_NEW", 2), "2 records");
  assert.equal(recordActionLabel("SCHOOL", "verify"), "Mark as verified");
  assert.equal(recordActionLabel("COACH_APPLICATION", "approve"), "Approve");
  assert.equal(recordActionLabel("SCHOOL", "markDuplicate"), "Mark duplicate");
  assert.equal(recordActionDanger("SCHOOL", "deactivate"), true);
  assert.equal(recordActionDanger("SCHOOL", "activate"), false);
  assert.equal(recordTypeLabel("TEACHER_APPLICATION"), "Teacher applications");
  assert.equal(countNoun("ASSIGNMENT", 2), "2 assignments");
  assert.equal(recordActionDanger("ASSIGNMENT", "archive"), true);
});

test("the bulk filter is the list's filters without paging, sorting or empty values", () => {
  assert.deepEqual(
    bulkFilterFrom({ page: 2, limit: 20, sort: "verifiedStudents", order: "desc", q: "  lycée ", isActive: false, countryCode: "RW", status: undefined, district: "" }),
    { q: "lycée", isActive: false, countryCode: "RW" },
  );
  assert.deepEqual(bulkFilterFrom({ page: 1, limit: 20 }), {});
});

test("ticking: one id, the page, and the limit", () => {
  let s = toggleRecord(new Set(), "a");
  assert.deepEqual([...s], ["a"]);
  s = toggleRecord(s, "a");
  assert.equal(s.size, 0);
  assert.equal(toggleRecord(new Set(["x"]), "y", 1).size, 1, "never past the limit");
  s = toggleRecordPage(new Set(), ["a", "b"]);
  assert.deepEqual([...s].sort(), ["a", "b"]);
  s = toggleRecordPage(s, ["a", "b"]);
  assert.equal(s.size, 0, "a full page is cleared");
  assert.equal(toggleRecordPage(new Set(), ["a", "b", "c"], 2).size, 2);
  assert.equal(DEFAULT_MAX_IDS, 1000);
});

test("selections and their summary (an empty filter says 'every … (no filter)')", () => {
  assert.equal(idsSelection(new Set()), null);
  assert.deepEqual(idsSelection(new Set(["a"])), { mode: "ids", ids: ["a"] });
  assert.equal(idsSelection(new Set(["a", "b"]), 1), null);
  assert.equal(recordSelectionSummary("SCHOOL", { mode: "ids", ids: ["a"] }), "1 selected school");
  assert.equal(recordSelectionSummary("SCHOOL", { mode: "ids", ids: ["a", "b"] }), "2 selected schools");
  assert.equal(recordSelectionSummary("SCHOOL", { mode: "filter", filter: {} }), "every school (no filter)");
  assert.equal(recordSelectionSummary("TEACHER_APPLICATION", { mode: "filter", filter: { status: "PENDING" } }), "every teacher application matching the current filters");
});

const PREVIEW = {
  entityType: "SCHOOL", action: "activate", params: {}, selection: { mode: "ids", ids: ["a", "b"] }, total: 2, sample: [], warnings: [],
  consequences: [], requiresReason: true, requiresStepUp: false, selectionToken: "tok-123456789",
};

test("confirmation: reason when required (3–500), acknowledgement, nothing to do, password when asked", () => {
  assert.deepEqual(recordConfirmProblems(PREVIEW, { reason: "ok now", currentPassword: "", acknowledged: true }), []);
  assert.match(recordConfirmProblems(PREVIEW, { ...EMPTY_CONFIRM, acknowledged: true })[0], /Give a reason/);
  assert.match(recordConfirmProblems(PREVIEW, { reason: "  ab ", currentPassword: "", acknowledged: true })[0], /Give a reason/);
  assert.match(recordConfirmProblems(PREVIEW, { reason: "valid", currentPassword: "", acknowledged: false })[0], /apply this to 2 schools/);
  assert.deepEqual(recordConfirmProblems({ ...PREVIEW, requiresReason: false }, { reason: "", currentPassword: "", acknowledged: true }), []);
  assert.match(recordConfirmProblems({ ...PREVIEW, requiresReason: false }, { reason: "x".repeat(501), currentPassword: "", acknowledged: true })[0], /at most 500/);
  assert.match(recordConfirmProblems({ ...PREVIEW, total: 0 }, { reason: "valid", currentPassword: "", acknowledged: true })[0], /No school matches/);
  assert.match(recordConfirmProblems({ ...PREVIEW, requiresStepUp: true }, { reason: "valid", currentPassword: "", acknowledged: true })[0], /current password/);
});

test("the execute body is exactly the previewed request", () => {
  assert.deepEqual(recordExecuteBody(PREVIEW, { reason: "  Term starts ", currentPassword: "secret", acknowledged: true }, "key-12345678"), {
    action: "activate", selection: PREVIEW.selection, selectionToken: "tok-123456789", expectedTotal: 2, confirm: true,
    idempotencyKey: "key-12345678", reason: "Term starts",
  });
  const withParams = recordExecuteBody({ ...PREVIEW, params: { x: 1 }, requiresStepUp: true }, { reason: "", currentPassword: "pw", acknowledged: true }, "k-12345678");
  assert.deepEqual(withParams.params, { x: 1 });
  assert.equal(withParams.currentPassword, "pw");
  assert.equal("reason" in withParams, false);
});

test("refusals: stale previews ask for a new one; others explain", () => {
  assert.deepEqual(recordBulkError("SCHOOL", { code: "SELECTION_CHANGED" }), {
    text: "The selected schools changed since the preview. Preview again and confirm the new selection.", previewAgain: true,
  });
  assert.equal(recordBulkError("SCHOOL", { code: "CONFIRMATION_EXPIRED" })?.previewAgain, true);
  assert.equal(recordBulkError("SCHOOL", { code: "CONFIRMATION_USED" })?.previewAgain, true);
  assert.equal(recordBulkError("SCHOOL", { code: "REASON_REQUIRED", message: "Give a reason (3–500 characters)." })?.text, "Give a reason (3–500 characters).");
  assert.equal(recordBulkError("COACH_APPLICATION", { code: "BULK_BUSY" })?.text, "The coach applications are busy. Try again in a moment.");
  assert.equal(recordBulkError("SCHOOL", { code: "SOMETHING_ELSE" }), null);
  assert.equal(recordBulkError("SCHOOL", null), null);
});

test("record summaries for previews and results", () => {
  assert.deepEqual(recordSummary("SCHOOL", { id: "s1", name: "GS Kigali", code: "123", district: "Gasabo", countryCode: "RW", isActive: false }), {
    title: "GS Kigali", detail: "code 123 · Gasabo · RW · inactive", href: "/admin/schools/s1",
  });
  assert.deepEqual(
    recordSummary("SCHOOL_AFFILIATION", { id: "c1", status: "PENDING", student: { id: "u1", username: "theoneste.nsanza", firstName: "Theoneste", lastName: "Nsanza" }, school: null, claimedName: "New School" }),
    { title: "Theoneste Nsanza @theoneste.nsanza", detail: "“New School” (not matched) · pending", href: "/admin/users/u1" },
  );
  assert.deepEqual(recordSummary("TEACHER_APPLICATION", { id: "t1", firstName: "Theoneste", lastName: "Nsanza", username: "tn", status: "PENDING", school: { name: "GS Kigali" } }), {
    title: "Theoneste Nsanza @tn", detail: "GS Kigali · pending", href: null,
  });
  assert.deepEqual(recordSummary("COACH_APPLICATION", { id: "m1", firstName: "Theoneste", lastName: "Nsanza", username: "tn", email: "theoneste.nsanza@example.com", status: "REJECTED" }), {
    title: "Theoneste Nsanza @tn", detail: "theoneste.nsanza@example.com · rejected", href: null,
  });
  assert.deepEqual(
    recordSummary("ASSIGNMENT", { id: "a1", title: "Week 3 problems", status: "PENDING_APPROVAL", course: { title: "Algebra" }, division: { name: "Junior" } }),
    { title: "Week 3 problems", detail: "Algebra · Junior · pending approval", href: "/admin/assignments/a1" },
  );
  assert.equal(recordSummary("SCHOOL", null), null);
  // An item carries its record under the type's key.
  const item = { entityId: "s1", outcome: "SUCCEEDED", code: null, message: null, stillBlockedBy: [], processedAt: null, school: { id: "s1", name: "GS Kigali" } };
  assert.equal(itemSummary("SCHOOL", item)?.title, "GS Kigali");
  assert.equal(itemSummary("SCHOOL", { ...item, school: null }), null);
  assert.equal(itemSummary("USER", { ...item, user: { id: "u1", username: "tn", firstName: "Theoneste", lastName: "Nsanza", role: "STUDENT", accountStatus: "ACTIVE" } })?.href, "/admin/users/u1");
});

test("result codes read as words", () => {
  assert.equal(recordItemCodeLabel("ALREADY_DECIDED"), "Already decided");
  assert.equal(recordItemCodeLabel("AFFILIATION_SUPERSEDED"), "Replaced by a newer claim");
  assert.equal(recordItemCodeLabel("SOME_NEW_CODE"), "some new code");
  assert.equal(recordItemCodeLabel(null), "");
});
