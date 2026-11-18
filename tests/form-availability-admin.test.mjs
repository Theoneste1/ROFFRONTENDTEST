// Administrators' form management (lib/admin/form-availability.ts): page and menu gating, Kigali-time inputs,
// the schedule rules (same as the backend's scheduleProblems), the PATCH bodies and the history lines.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FORMS_VIEW_PERMISSION,
  availabilityChange,
  availabilityDraft,
  availabilityProblems,
  formStateLabel,
  formsErrorMessage,
  formsNavVisible,
  formsPageMode,
  historyLines,
  historySource,
  isoToKigaliInput,
  kigaliInputToIso,
  messagesChange,
  messagesDraft,
  messagesProblems,
  neverChanged,
  scheduleSummary,
  teacherRoleNote,
} from "../lib/admin/form-availability.ts";
import { ADMIN_FORMS, ADMIN_NAV, canSeeNavItem } from "../lib/auth/navigation.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["formAvailability"] };
const can = (...held) => (p) => held.includes(p);

test("gating: loading, unsupported, error, forbidden, visible", () => {
  const mode = (over) => formsPageMode({ detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can("forms.view"), ...over });
  assert.equal(mode({}), "visible");
  assert.equal(mode({ detectionLoading: true, detection: undefined }), "loading");
  assert.equal(mode({ permissionsStatus: "loading" }), "loading");
  for (const detection of [{ ...HAS, features: [] }, { state: "LEGACY" }, { state: "UNKNOWN" }]) {
    assert.equal(mode({ detection }), "unsupported");
    assert.equal(formsNavVisible(detection, new Set(["forms.view"])), false);
  }
  assert.equal(mode({ permissionsStatus: "error" }), "error");
  assert.equal(mode({ can: can() }), "forbidden");
});

test("menu: only with the feature and the known forms.view; never part of the frozen ADMIN_NAV", () => {
  assert.equal(formsNavVisible(HAS, new Set([FORMS_VIEW_PERMISSION])), true);
  assert.equal(formsNavVisible(HAS, new Set(["forms.manageAvailability"])), false);
  assert.equal(formsNavVisible(HAS, null), false);
  assert.equal(ADMIN_FORMS.href, "/admin/forms");
  assert.equal(ADMIN_FORMS.permission, "forms.view");
  assert.equal(canSeeNavItem(ADMIN_FORMS, new Set(["forms.view"])), true);
  assert.ok(!ADMIN_NAV.some((i) => i.href === "/admin/forms"));
});

test("Kigali time: ISO ⇄ datetime-local (UTC+2, no daylight saving)", () => {
  assert.equal(isoToKigaliInput("2026-12-01T06:00:00.000Z"), "2026-12-01T08:00");
  assert.equal(isoToKigaliInput("2026-12-31T23:30:00Z"), "2027-01-01T01:30");
  assert.equal(isoToKigaliInput(null), "");
  assert.equal(isoToKigaliInput("not a date"), "");
  assert.equal(kigaliInputToIso("2026-12-01T08:00"), "2026-12-01T08:00:00+02:00");
  assert.equal(new Date(kigaliInputToIso("2026-12-01T08:00")).toISOString(), "2026-12-01T06:00:00.000Z");
  assert.equal(kigaliInputToIso(""), null);
  assert.equal(kigaliInputToIso("2026-02-31T08:00"), null);
  assert.equal(kigaliInputToIso("2026-12-01 08:00"), null);
  // Round trip.
  assert.equal(isoToKigaliInput(kigaliInputToIso("2027-03-15T17:45")), "2027-03-15T17:45");
});

test("schedule rules mirror the backend: SCHEDULED needs an opening time; closing after opening", () => {
  assert.deepEqual(availabilityProblems({ mode: "OPEN", opensAt: "", closesAt: "" }), []);
  assert.deepEqual(availabilityProblems({ mode: "CLOSED", opensAt: "2026-12-02T08:00", closesAt: "2026-12-01T08:00" }), []);
  assert.deepEqual(availabilityProblems({ mode: "SCHEDULED", opensAt: "", closesAt: "" }), ["A scheduled form needs an opening time."]);
  assert.deepEqual(availabilityProblems({ mode: "SCHEDULED", opensAt: "2026-12-02T08:00", closesAt: "2026-12-02T08:00" }), ["The closing time must be after the opening time."]);
  assert.deepEqual(availabilityProblems({ mode: "SCHEDULED", opensAt: "2026-12-01T08:00", closesAt: "2026-12-31T17:00" }), []);
  // OPEN ignores the order of the dates (the backend checks it only for SCHEDULED).
  assert.deepEqual(availabilityProblems({ mode: "OPEN", opensAt: "2026-12-02T08:00", closesAt: "2026-12-01T08:00" }), []);
  assert.deepEqual(availabilityProblems({ mode: "OPEN", opensAt: "", closesAt: "2026-02-31T08:00" }), ["The closing time is not a valid date and time."]);
});

test("availability body: only what changed; an emptied date is null; nothing changed → null", () => {
  const current = { mode: "CLOSED", opensAt: null, closesAt: "2026-12-31T15:00:00.000Z" };
  const d = availabilityDraft(current);
  assert.deepEqual(d, { mode: "CLOSED", opensAt: "", closesAt: "2026-12-31T17:00" });
  assert.equal(availabilityChange(current, d), null);
  assert.deepEqual(availabilityChange(current, { ...d, mode: "OPEN" }), { mode: "OPEN" });
  assert.deepEqual(availabilityChange(current, { ...d, closesAt: "" }), { closesAt: null });
  assert.deepEqual(availabilityChange(current, { mode: "SCHEDULED", opensAt: "2026-12-01T08:00", closesAt: "2026-12-31T17:00" }), {
    mode: "SCHEDULED",
    opensAt: "2026-12-01T08:00:00+02:00",
  });
});

test("messages: draft from the stored texts; body only with changes; emptied → null; validation", () => {
  const current = { closedMessageCustom: null, instructions: "Bring your school ID.", contactEmail: null, supportUrl: "https://rof.rw/help" };
  const d = messagesDraft(current);
  assert.deepEqual(d, { closedMessage: "", instructions: "Bring your school ID.", contactEmail: "", supportUrl: "https://rof.rw/help" });
  assert.equal(messagesChange(current, d), null);
  assert.equal(messagesChange(current, { ...d, instructions: "  Bring your school ID.  " }), null);
  assert.deepEqual(messagesChange(current, { ...d, closedMessage: " Back in January. ", supportUrl: "" }), { closedMessage: "Back in January.", supportUrl: null });
  assert.deepEqual(messagesProblems(d), {});
  assert.deepEqual(Object.keys(messagesProblems({ ...d, contactEmail: "not-an-email", supportUrl: "http://rof.rw" })).sort(), ["contactEmail", "supportUrl"]);
  assert.ok(messagesProblems({ ...d, closedMessage: "x".repeat(1001) }).closedMessage);
});

test("summary and labels", () => {
  assert.equal(scheduleSummary({ state: "OPEN", mode: "OPEN", opensAt: null, closesAt: null }), "Open, no closing date");
  assert.equal(scheduleSummary({ state: "OPEN", mode: "OPEN", opensAt: null, closesAt: "2026-12-31T15:00:00Z" }), "Open until 31 December 2026, 17:00 (Kigali time)");
  assert.equal(
    scheduleSummary({ state: "NOT_YET_OPEN", mode: "SCHEDULED", opensAt: "2026-12-01T06:00:00Z", closesAt: null }),
    "Opens 1 December 2026, 08:00 (Kigali time)",
  );
  assert.equal(scheduleSummary({ state: "CLOSED", mode: "CLOSED", opensAt: null, closesAt: null }), "Closed");
  assert.equal(formStateLabel("NOT_YET_OPEN"), "Opens later");
  assert.equal(formStateLabel("SOMETHING_NEW"), "SOMETHING_NEW");
  assert.equal(neverChanged({ updatedAt: "1970-01-01T00:00:00.000Z" }), true);
  assert.equal(neverChanged({ updatedAt: "2026-11-16T10:00:00.000Z" }), false);
});

test("history lines and source", () => {
  const row = {
    action: "FORM_AVAILABILITY_CHANGED",
    metadata: { via: "setting", changes: { mode: { from: "OPEN", to: "CLOSED" }, closesAt: { from: "2026-12-31T15:00:00.000Z", to: null } } },
  };
  assert.deepEqual(historyLines(row), ["Mode: Open → Closed", "Closing time: 31 December 2026, 17:00 (Kigali time) → none"]);
  assert.equal(historySource(row), "Availability (Settings switch)");
  assert.equal(historySource({ action: "FORM_AVAILABILITY_CHANGED", metadata: { via: "admin" } }), "Availability");
  assert.equal(historySource({ action: "FORM_MESSAGES_CHANGED", metadata: {} }), "Messages");
  assert.deepEqual(historyLines({ metadata: { changes: { closedMessage: { from: null, to: "Back soon." } } } }), ["Closed message: built-in message → Back soon."]);
  assert.deepEqual(historyLines({ metadata: null }), []);
});

test("errors and the Teacher-role note", () => {
  assert.match(formsErrorMessage({ status: 400, code: "INVALID_FORM_SCHEDULE", message: "closesAt must be after opensAt." }), /refused: closesAt must be after opensAt/);
  assert.equal(formsErrorMessage({ status: 400, code: "NO_CHANGES" }), "Nothing changed.");
  assert.equal(formsErrorMessage({ status: 403 }), "You don't have permission to change this form.");
  assert.equal(formsErrorMessage({ status: 500 }), null);
  assert.match(teacherRoleNote({ key: "TEACHER_REGISTRATION", requiresTeacherRole: true, teacherRoleEnabled: false }), /stays closed/);
  assert.equal(teacherRoleNote({ key: "TEACHER_REGISTRATION", requiresTeacherRole: true, teacherRoleEnabled: true }), null);
  assert.equal(teacherRoleNote({ key: "STUDENT_REGISTRATION" }), null);
});
