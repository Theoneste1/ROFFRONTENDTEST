// Closed registration forms: the administrator's texts (lib/forms/closed-form.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { formGate, kigaliTime, noticeFromRefusal, noticeFromView } from "../lib/forms/closed-form.ts";

const CUSTOM = "Student registration is currently closed. Please contact the Rwanda Olympiad Foundation for further information or check back later.";
const view = (over = {}) => ({
  key: "STUDENT_REGISTRATION", open: false, state: "CLOSED", opensAt: null, closesAt: null,
  closedMessage: CUSTOM, instructions: "Bring your school ID.", contactEmail: "info@rwandaolympiadfoundation.org", supportUrl: "https://rwandaolympiadfoundation.org/contact",
  ...over,
});

test("kigaliTime: UTC shown in Kigali (UTC+2); invalid or missing → null", () => {
  assert.equal(kigaliTime("2026-11-30T22:00:00.000Z"), "1 December 2026, 00:00 (Kigali time)");
  assert.equal(kigaliTime("2026-12-01T06:00:00Z"), "1 December 2026, 08:00 (Kigali time)");
  assert.equal(kigaliTime(null), null);
  assert.equal(kigaliTime("not a date"), null);
});

test("noticeFromView: the administrator's message, instructions and contact; null while open", () => {
  assert.equal(noticeFromView(view({ open: true, state: "OPEN" })), null);
  assert.equal(noticeFromView(null), null);
  assert.deepEqual(noticeFromView(view()), {
    message: CUSTOM, instructions: "Bring your school ID.", contactEmail: "info@rwandaolympiadfoundation.org",
    supportUrl: "https://rwandaolympiadfoundation.org/contact", opensAtText: null,
  });
});

test("noticeFromView: the opening time only when not yet open; empty texts dropped; only https links", () => {
  const later = noticeFromView(view({ state: "NOT_YET_OPEN", opensAt: "2026-12-01T06:00:00Z" }));
  assert.equal(later.opensAtText, "1 December 2026, 08:00 (Kigali time)");
  assert.equal(noticeFromView(view({ state: "ENDED", opensAt: "2026-12-01T06:00:00Z" })).opensAtText, null);
  const bare = noticeFromView(view({ instructions: "  ", contactEmail: null, supportUrl: "http://insecure.example" }));
  assert.equal(bare.instructions, null);
  assert.equal(bare.contactEmail, null);
  assert.equal(bare.supportUrl, null);
  assert.equal(noticeFromView(view({ supportUrl: "javascript:alert(1)" })).supportUrl, null);
});

test("noticeFromRefusal: 403 REGISTRATION_CLOSED / FORM_CLOSED with form details → the backend's message and contact", () => {
  const err = {
    status: 403, code: "REGISTRATION_CLOSED", message: `${CUSTOM} It opens on 1 December 2026, 08:00 (Kigali time).`,
    details: { form: "STUDENT_REGISTRATION", state: "NOT_YET_OPEN", opensAt: "2026-12-01T06:00:00Z", closesAt: null, closedMessage: CUSTOM, contactEmail: "info@rwandaolympiadfoundation.org", supportUrl: null },
  };
  const n = noticeFromRefusal(err, view());
  assert.equal(n.message, err.message);   // already says when it opens: not repeated
  assert.equal(n.opensAtText, null);
  assert.equal(n.contactEmail, "info@rwandaolympiadfoundation.org");
  assert.equal(n.instructions, "Bring your school ID.");   // from the public view (the refusal has none)
  assert.equal(noticeFromRefusal(err).instructions, null);
  assert.ok(noticeFromRefusal({ ...err, code: "FORM_CLOSED" }));
});

test("noticeFromRefusal: anything else → null, so the caller keeps its fixed text", () => {
  // An older backend: REGISTRATION_CLOSED without form details.
  assert.equal(noticeFromRefusal({ status: 403, code: "REGISTRATION_CLOSED", message: "Student self-registration is currently closed." }), null);
  assert.equal(noticeFromRefusal({ status: 403, code: "PERMISSION_REQUIRED", details: { form: "X" } }), null);
  assert.equal(noticeFromRefusal({ status: 400, code: "REGISTRATION_CLOSED", details: { form: "X" } }), null);
  assert.equal(noticeFromRefusal(null), null);
});

test("formGate (student form): loading, closed, open and failed lookups; never assumed open", () => {
  assert.equal(formGate(true, { status: "pending" }), "loading");
  assert.equal(formGate(true, { status: "success", data: view() }), "closed");
  assert.equal(formGate(true, { status: "success", data: view({ open: true, state: "OPEN" }) }), "open");
  assert.equal(formGate(true, { status: "success", data: view({ state: "NOT_YET_OPEN" }) }), "closed");
  assert.equal(formGate(true, { status: "error" }), "failed");
  assert.equal(formGate(true, { status: "success", data: null }), "failed");
  // Older backend (no formAvailability): not applicable, whatever the (disabled) query reports.
  for (const status of ["pending", "error", "success"]) assert.equal(formGate(false, { status }), "notApplicable");
});
