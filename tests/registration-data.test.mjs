// Registration data (lib/admin/registration-data.ts): the filter tree, checks before sending, values, changes, menu entry.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addCondition, addGroup, cellText, changedValues, countConditions, editValue, emptyGroup, filterProblems, groupFields, initialValue,
  knownColumns, MAX_DEPTH, moveItem, newCondition, pruneFilter, registrationDataNavVisible, removeAt, saveFilterProblem, setCombinator, setCondition,
} from "../lib/admin/registration-data.ts";

const OPS = {
  contains: { label: "contains", needsValue: true, range: false },
  between: { label: "is between", needsValue: true, range: true },
  gt: { label: "is greater than", needsValue: true, range: false },
  in: { label: "is any of", needsValue: true, range: false },
  isEmpty: { label: "is empty", needsValue: false, range: false },
  isTrue: { label: "is yes", needsValue: false, range: false },
};
const field = (key, type, extra = {}) => ({
  key, label: key.split(".")[1], group: "Account and registration", type, values: null, valueLabels: null, nullable: true, integer: false,
  maxLength: null, personal: false, reference: null, editVia: "direct", editable: true, filterable: true, sortable: true,
  operators: type === "number" ? ["gt", "between", "isEmpty"] : type === "enum" ? ["in", "isEmpty"] : type === "boolean" ? ["isTrue"] : ["contains", "isEmpty"],
  ...extra,
});
const NAME = field("user.firstName", "text");
const YEARS = field("coachApplication.yearsOfExperience", "number", { group: "Coach application", integer: true });
const GENDER = field("user.gender", "enum", { values: ["FEMALE", "MALE"], valueLabels: { FEMALE: "Female", MALE: "Male" } });
const SUBJECTS = field("user.olympiadInterests", "enumList", { values: ["MATHEMATICS", "PHYSICS"], valueLabels: { MATHEMATICS: "Mathematics", PHYSICS: "Physics" } });
const FIELDS = [NAME, YEARS, GENDER, SUBJECTS];

test("a new condition starts with the field's first condition and an empty value of the right shape", () => {
  assert.deepEqual(newCondition(NAME), { field: "user.firstName", operator: "contains", value: "" });
  assert.deepEqual(newCondition(GENDER), { field: "user.gender", operator: "in", value: [] });
  assert.deepEqual(initialValue(NAME, "isEmpty"), undefined);
  assert.deepEqual(initialValue(SUBJECTS, "hasAny"), []);
});

test("the tree: add, change, nest, remove — always a new tree, never changed in place", () => {
  const root = emptyGroup();
  const a = addCondition(root, [], newCondition(NAME));
  assert.equal(root.conditions.length, 0);
  const b = addGroup(a, [], "OR");
  const c = addCondition(b, [1], newCondition(GENDER));
  const d = setCondition(c, [1], 0, { field: "user.gender", operator: "in", value: ["FEMALE"] });
  const e = setCombinator(d, [1], "AND");
  assert.deepEqual(e, { combinator: "AND", conditions: [{ field: "user.firstName", operator: "contains", value: "" }, { combinator: "AND", conditions: [{ field: "user.gender", operator: "in", value: ["FEMALE"] }] }] });
  assert.equal(countConditions(e), 2);
  assert.equal(countConditions(removeAt(e, [], 1)), 1);
  // Never deeper than the backend accepts.
  let deep = emptyGroup();
  let path = [];
  for (let i = 0; i < 6; i++) {
    deep = addGroup(deep, path, "OR");
    if (path.length + 1 < MAX_DEPTH) path = [...path, 0];
  }
  const depth = (g) => 1 + Math.max(0, ...g.conditions.filter((x) => "conditions" in x).map(depth));
  assert.ok(depth(deep) <= MAX_DEPTH);
});

test("empty groups are dropped before sending", () => {
  const g = { combinator: "AND", conditions: [{ combinator: "OR", conditions: [] }, { field: "user.firstName", operator: "contains", value: "a" }, { combinator: "OR", conditions: [{ combinator: "AND", conditions: [] }] }] };
  assert.deepEqual(pruneFilter(g), { combinator: "AND", conditions: [{ field: "user.firstName", operator: "contains", value: "a" }] });
});

test("problems before sending, in plain words: missing values, half ranges, not a number, a field gone", () => {
  const g = { combinator: "AND", conditions: [
    { field: "user.firstName", operator: "contains", value: " " },
    { field: "coachApplication.yearsOfExperience", operator: "between", value: 2 },
    { field: "coachApplication.yearsOfExperience", operator: "gt", value: "ten" },
    { field: "user.gender", operator: "in", value: [] },
    { field: "user.firstName", operator: "isEmpty" },
    { field: "user.removedField", operator: "contains", value: "x" },
  ] };
  assert.deepEqual(filterProblems(g, FIELDS, OPS), [
    "Give a value for “firstName contains”.",
    "Give both ends of the range for “yearsOfExperience is between”.",
    "“yearsOfExperience is greater than”: enter a number.",
    "Give a value for “gender is any of”.",
    "A condition uses a field that is no longer available. Remove it.",
  ]);
  assert.deepEqual(filterProblems({ combinator: "OR", conditions: [{ field: "user.firstName", operator: "contains", value: "a" }] }, FIELDS, OPS), []);
});

test("cells: choices in words, lists joined, yes / no, Kigali time, empty as —", () => {
  assert.equal(cellText("FEMALE", GENDER), "Female");
  assert.equal(cellText(["MATHEMATICS", "PHYSICS"], SUBJECTS), "Mathematics, Physics");
  assert.equal(cellText([], SUBJECTS), "—");
  assert.equal(cellText(null, NAME), "—");
  assert.equal(cellText(true, field("user.isApproved", "boolean")), "Yes");
  assert.equal(cellText(7, YEARS), "7");
  assert.match(cellText("2026-11-20T21:30:00.000Z", field("user.createdAt", "datetime")), /20 Nov 2026.*23:30/);
});

test("only what changed is sent; a list compared as a set; date-times as ISO", () => {
  const rec = [
    { key: "user.firstName", type: "text", value: "Ana" },
    { key: "user.olympiadInterests", type: "enumList", value: ["MATHEMATICS", "PHYSICS"] },
    { key: "coachApplication.yearsOfExperience", type: "number", value: 4 },
    { key: "user.isApproved", type: "boolean", value: true },
  ];
  assert.deepEqual(editValue(4, YEARS), "4");
  assert.deepEqual(changedValues(rec, { "user.firstName": "Ana", "user.olympiadInterests": ["PHYSICS", "MATHEMATICS"], "coachApplication.yearsOfExperience": "4", "user.isApproved": true }), {});
  assert.deepEqual(changedValues(rec, { "user.firstName": "Anna", "user.olympiadInterests": ["PHYSICS"], "coachApplication.yearsOfExperience": "5" }), {
    "user.firstName": "Anna", "user.olympiadInterests": ["PHYSICS"], "coachApplication.yearsOfExperience": "5",
  });
});

test("columns, groups, order, names", () => {
  assert.deepEqual(knownColumns(["user.firstName", "user.gone", "user.firstName", "user.gender"], FIELDS), ["user.firstName", "user.gender"]);
  assert.deepEqual(groupFields(FIELDS).map((g) => [g.group, g.fields.length]), [["Account and registration", 3], ["Coach application", 1]]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"]);
  assert.equal(saveFilterProblem(" x "), "Give the filter a name of 2–120 characters.");
  assert.equal(saveFilterProblem("Girls in Physics"), undefined);
});

test("the menu entry: the backend feature and the known permission (Super Administrators)", () => {
  const det = (features) => ({ state: "NEW", features });
  assert.equal(registrationDataNavVisible(det(["registrationData"]), new Set(["registrationData.manage"])), true);
  assert.equal(registrationDataNavVisible(det(["registrationData"]), new Set(["users.manage"])), false);
  assert.equal(registrationDataNavVisible(det([]), new Set(["registrationData.manage"])), false);
  assert.equal(registrationDataNavVisible(det(["registrationData"]), null), false);
});
