// Bulk user operations (lib/admin/bulk-users.ts): gating, the actions offered, the selection, the parameters,
// the confirmation rules, the execute body and the progress helpers.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SELECTED,
  allowedActions,
  bulkAvailable,
  bulkErrorMessage,
  bulkRoleOptions,
  buildParams,
  buildSelection,
  canCancel,
  confirmProblems,
  executeBody,
  exportAvailable,
  filterFromListFilters,
  isOperationActive,
  itemCodeLabel,
  newIdempotencyKey,
  operationStatusLabel,
  progressPercent,
  selectionSummary,
  toggleId,
  togglePage,
} from "../lib/admin/bulk-users.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["bulkUserOperations"] };
const can = (...held) => (p) => held.includes(p);

test("gating: the feature AND the permission", () => {
  assert.equal(bulkAvailable(HAS, can("users.bulkManage")), true);
  assert.equal(bulkAvailable(HAS, can()), false);
  assert.equal(bulkAvailable({ ...HAS, features: [] }, can("users.bulkManage")), false);
  assert.equal(bulkAvailable({ state: "LEGACY" }, can("users.bulkManage")), false);
  assert.equal(bulkAvailable(undefined, can("users.bulkManage")), false);
  assert.equal(exportAvailable(HAS, can("users.export")), true);
  assert.equal(exportAvailable(HAS, can("users.bulkManage")), false);
});

test("actions: only those whose every permission is held", () => {
  assert.deepEqual(allowedActions(can()), ["changeClassification", "assignRole"]);
  assert.deepEqual(allowedActions(can("email.bulkSend", "users.changeStatus")), ["message", "changeClassification", "assignRole", "deactivate"]);
  const all = allowedActions(can("email.bulkSend", "users.changeStatus", "users.suspend", "users.archive"));
  assert.deepEqual(all, ["message", "changeClassification", "assignRole", "activate", "deactivate", "suspend", "archive", "restore"]);
  assert.deepEqual(bulkRoleOptions(["STUDENT", "MENTOR", "ADMIN", "SUPER_ADMIN"]), ["STUDENT", "MENTOR", "ADMIN"]);
});

test("selection: list filters without paging; chosen ids capped; explicit wording for no filter", () => {
  assert.deepEqual(filterFromListFilters({ role: "STUDENT", search: "  amina ", isActive: true, isActivated: false, page: 3, limit: 20, divisionId: "" }), {
    role: "STUDENT",
    search: "amina",
    isActive: true,
    isActivated: false,
  });
  assert.deepEqual(buildSelection("filter", new Set(), { page: 2, limit: 20 }), { mode: "filter", filter: {} });
  assert.deepEqual(buildSelection("selected", new Set(["a", "b"]), {}), { mode: "ids", ids: ["a", "b"] });
  assert.equal(buildSelection("selected", new Set(), {}), null);
  assert.equal(selectionSummary({ mode: "filter", filter: {} }), "every account on the platform (no filter)");
  assert.equal(selectionSummary({ mode: "filter", filter: { role: "STUDENT" } }), "every account matching the current filters");
  assert.equal(selectionSummary({ mode: "ids", ids: ["a"] }), "1 selected account");
});

test("ticking: toggle one, toggle a page, never past the maximum", () => {
  let s = toggleId(new Set(), "a");
  assert.deepEqual([...s], ["a"]);
  s = toggleId(s, "a");
  assert.equal(s.size, 0);
  s = togglePage(new Set(["x"]), ["a", "b"]);
  assert.deepEqual([...s].sort(), ["a", "b", "x"]);
  s = togglePage(s, ["a", "b"]);
  assert.deepEqual([...s], ["x"]);
  const full = new Set(Array.from({ length: MAX_SELECTED }, (_, i) => `id${i}`));
  assert.equal(toggleId(full, "extra").size, MAX_SELECTED);
  assert.equal(togglePage(full, ["extra1", "extra2"]).size, MAX_SELECTED);
});

test("parameters: each action's own, with the backend's limits; never Super Administrator", () => {
  const empty = { role: "", gradeLevel: "", subject: "", body: "" };
  assert.deepEqual(buildParams("deactivate", empty), {});
  assert.equal(buildParams("assignRole", empty).problem, "Choose the new role.");
  assert.match(buildParams("assignRole", { ...empty, role: "SUPER_ADMIN" }).problem, /never assigned in bulk/);
  assert.deepEqual(buildParams("assignRole", { ...empty, role: "MENTOR" }), { params: { role: "MENTOR" } });
  assert.deepEqual(buildParams("changeClassification", { ...empty, gradeLevel: "S4" }), { params: { gradeLevel: "S4" } });
  assert.ok(buildParams("message", { ...empty, subject: "x", body: "hello world" }).problem);
  assert.ok(buildParams("message", { ...empty, subject: "Hi", body: "hey" }).problem);
  assert.deepEqual(buildParams("message", { ...empty, subject: "  Hi all ", body: "Welcome back!" }), { params: { subject: "Hi all", body: "Welcome back!" } });
});

const PREVIEW = {
  action: "suspend",
  params: {},
  selection: { mode: "filter", filter: { role: "STUDENT" } },
  total: 12,
  sample: [],
  warnings: [],
  consequences: [],
  requiresReason: true,
  requiresStepUp: false,
  selectionToken: "v1.12.abcdef0123",
};

test("confirmation: reason when required, password for step-up, explicit acknowledgement, non-empty", () => {
  const ok = { reason: "End of term", currentPassword: "", acknowledged: true };
  assert.deepEqual(confirmProblems(PREVIEW, ok), []);
  assert.equal(confirmProblems(PREVIEW, { ...ok, reason: "x" }).length, 1);
  assert.equal(confirmProblems(PREVIEW, { ...ok, acknowledged: false }).length, 1);
  assert.equal(confirmProblems({ ...PREVIEW, total: 0 }, ok).length, 1);
  assert.equal(confirmProblems({ ...PREVIEW, requiresStepUp: true }, ok).length, 1);
  assert.deepEqual(confirmProblems({ ...PREVIEW, requiresStepUp: true }, { ...ok, currentPassword: "secret" }), []);
  assert.deepEqual(confirmProblems({ ...PREVIEW, requiresReason: false }, { ...ok, reason: "" }), []);
});

test("execute body: exactly the previewed request; password only when asked; empty params omitted", () => {
  const body = executeBody(PREVIEW, { reason: " End of term ", currentPassword: "pw", acknowledged: true }, "key-12345678");
  assert.deepEqual(body, {
    action: "suspend",
    selection: PREVIEW.selection,
    selectionToken: PREVIEW.selectionToken,
    expectedTotal: 12,
    confirm: true,
    idempotencyKey: "key-12345678",
    reason: "End of term",
  });
  const role = executeBody({ ...PREVIEW, action: "assignRole", params: { role: "ADMIN" }, requiresReason: false, requiresStepUp: true }, { reason: "", currentPassword: "pw", acknowledged: true }, "key-12345678");
  assert.deepEqual(role.params, { role: "ADMIN" });
  assert.equal(role.currentPassword, "pw");
  assert.equal("reason" in role, false);
  const k = newIdempotencyKey();
  assert.ok(k.length >= 8 && k.length <= 128);
  assert.notEqual(k, newIdempotencyKey());
});

test("errors: a changed selection asks for a new preview", () => {
  assert.deepEqual(bulkErrorMessage({ status: 409, code: "SELECTION_CHANGED" }).previewAgain, true);
  assert.equal(bulkErrorMessage({ status: 400, code: "EMPTY_SELECTION" }).previewAgain, true);
  assert.equal(bulkErrorMessage({ status: 503, code: "BULK_BUSY" }).previewAgain, false);
  assert.equal(bulkErrorMessage({ status: 500 }), null);
});

test("progress helpers", () => {
  assert.equal(progressPercent({ total: 10, succeeded: 3, failed: 1, skipped: 1 }), 50);
  assert.equal(progressPercent({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), 100);
  assert.equal(isOperationActive({ status: "RUNNING" }), true);
  assert.equal(isOperationActive({ status: "CANCELLING" }), true);
  assert.equal(isOperationActive({ status: "COMPLETED_WITH_FAILURES" }), false);
  assert.equal(isOperationActive({ status: "SOMETHING_NEW" }), false);
  assert.equal(canCancel({ status: "PENDING" }), true);
  assert.equal(canCancel({ status: "CANCELLING" }), false);
  assert.equal(operationStatusLabel("COMPLETED_WITH_FAILURES"), "Completed with failures");
  assert.equal(itemCodeLabel("USE_RESTORE"), "Archived: use Restore");
  assert.equal(itemCodeLabel("SOMETHING"), "SOMETHING");
  assert.equal(itemCodeLabel(null), "");
});
