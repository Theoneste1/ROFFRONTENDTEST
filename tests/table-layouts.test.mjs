// Configurable user tables (lib/admin/table-layouts.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_TABLES, builtInLayout, moveColumn, nextSort, sameLayout, toggleColumn, userTableFor, visibleColumns } from "../lib/admin/table-layouts.ts";

test("each role tab has its own table", () => {
  assert.equal(userTableFor("STUDENT"), "users.students");
  assert.equal(userTableFor("MENTOR"), "users.coaches");
  assert.equal(userTableFor("HEAD_COACH"), "users.headCoaches");
  assert.equal(userTableFor("TEACHER"), "users.teachers");
  assert.equal(userTableFor("ADMIN"), "users.admins");
  assert.equal(userTableFor("SUPER_ADMIN"), "users.admins");
  assert.equal(userTableFor(""), "users.all");
  assert.equal(userTableFor(undefined), "users.all");
});

test("the built-in layouts hide the username and show Last login", () => {
  for (const table of Object.keys(BUILT_IN_TABLES)) {
    const shown = visibleColumns(builtInLayout(table)).map((c) => c.key);
    assert.ok(!shown.includes("username"), table);
    assert.ok(shown.includes("lastLoginAt"), table);
    assert.equal(shown[0], "name", table);
  }
  assert.deepEqual(visibleColumns(builtInLayout("users.students")).map((c) => c.key), ["name", "email", "school", "grade", "olympiadLevel", "accountStatus", "registeredAt", "lastLoginAt"]);
});

test("move, show and hide columns", () => {
  const cols = [{ key: "a", visible: true }, { key: "b", visible: false }, { key: "c", visible: true }];
  assert.deepEqual(moveColumn(cols, "c", -1).map((c) => c.key), ["a", "c", "b"]);
  assert.deepEqual(moveColumn(cols, "a", -1).map((c) => c.key), ["a", "b", "c"]);
  assert.deepEqual(moveColumn(cols, "c", 1).map((c) => c.key), ["a", "b", "c"]);
  assert.deepEqual(toggleColumn(cols, "b").map((c) => c.visible), [true, true, true]);
  // The last visible column stays visible.
  const one = [{ key: "a", visible: true }, { key: "b", visible: false }];
  assert.deepEqual(toggleColumn(one, "a"), one);
  assert.equal(sameLayout(cols, cols.map((c) => ({ ...c }))), true);
  assert.equal(sameLayout(cols, moveColumn(cols, "c", -1)), false);
});

test("visible columns follow the saved order and ignore unknown keys", () => {
  const layout = { available: [{ key: "name", label: "Full name" }, { key: "email", label: "Email" }], columns: [{ key: "email", visible: true }, { key: "gone", visible: true }, { key: "name", visible: true }] };
  assert.deepEqual(visibleColumns(layout).map((c) => c.key), ["email", "name"]);
});

test("sorting by a header", () => {
  assert.deepEqual(nextSort({}, "name"), { sort: "name", order: "asc" });
  assert.deepEqual(nextSort({}, "lastLoginAt"), { sort: "lastLoginAt", order: "desc" });
  assert.deepEqual(nextSort({ sort: "name", order: "asc" }, "name"), { sort: "name", order: "desc" });
  assert.deepEqual(nextSort({ sort: "lastLoginAt" }, "lastLoginAt"), { sort: "lastLoginAt", order: "asc" });
  assert.deepEqual(nextSort({ sort: "name", order: "desc" }, "email"), { sort: "email", order: "asc" });
});
