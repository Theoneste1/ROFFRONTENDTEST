// The registration forms as ONE continuous form: the fields of the Student, Teacher and Coach forms in order
// (lib/forms/registration-fields.ts — every error their own rules or the server can produce has exactly one field to show
// it on), and the form component rendered with react-dom/server (app/components/forms/SignupForm.tsx): every field in
// order, two columns where they pair, no steps, no section headings, no progress, no Next / Back, one submit button.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { COACH_PARTS, STUDENT_PARTS, TEACHER_PARTS, coachParts, partOfField, visibleParts } from "../lib/forms/registration-fields.ts";
import { SCHOOL_CLAIM_SERVER_FIELDS, validateSchoolClaim } from "../lib/accounts/school-claim.ts";
import { STUDENT_DETAILS_ERRORS, STUDENT_DETAILS_SERVER_FIELDS, emptyStudentDetails, validateStudentDetails } from "../lib/accounts/student-details.ts";
import { TEACHER_ERROR_FIELDS, TEACHER_SERVER_FIELDS, emptyTeacherDraft, validateTeacherRegistration } from "../lib/accounts/teacher-registration.ts";
import { emptyCoachExtra, emptyTeacherExtra, validateCoachExtra, validateTeacherExtra } from "../lib/accounts/application-details.ts";
import { emptyCoachDetails, validateCoachDetails } from "../lib/accounts/coach-application.ts";
import { emptyDraft } from "../app/components/account/SchoolClaimFields.tsx";
import SignupForm from "../app/components/forms/SignupForm.tsx";

/** Every key belongs to exactly one part, and no two parts share a key or an id. */
function assertCovered(parts, keys, what) {
  const all = parts.flatMap((p) => p.fields);
  assert.equal(new Set(all).size, all.length, `${what}: a key on two parts`);
  assert.equal(new Set(parts.map((p) => p.id)).size, parts.length, `${what}: a part twice`);
  for (const k of keys) assert.ok(partOfField(parts, k), `${what}: "${k}" has no field`);
}

const ids = (parts) => parts.map((p) => p.id);

test("Student: every error of its rules and of the server has a field; names first, the account last", () => {
  // RegisterForm's own validate() (FIELDS + confirm), the school claim in every mode, the personal details, the picture.
  const form = ["firstName", "lastName", "username", "email", "password", "confirm", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "olympiadInterests"];
  const claim = ["directory", "notListed", "abroad"].flatMap((m) => Object.keys(validateSchoolClaim(emptyDraft(m))));
  const details = [
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "" })),
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "KE" })),
  ];
  const server = [...Object.values(SCHOOL_CLAIM_SERVER_FIELDS), ...Object.values(STUDENT_DETAILS_ERRORS).map((e) => e.field), ...STUDENT_DETAILS_SERVER_FIELDS];
  assert.ok(claim.length > 0 && details.length > 0);
  assertCovered(STUDENT_PARTS, [...form, ...claim, ...details, ...server, "picture"], "student");
  assert.deepEqual(ids(STUDENT_PARTS).slice(0, 2), ["firstName", "lastName"]);
  assert.deepEqual(ids(STUDENT_PARTS).slice(-4), ["username", "email", "password", "confirm"]);
  // A school abroad: its country and name, no Rwandan places.
  const abroad = visibleParts(STUDENT_PARTS, (p) => !["schoolProvince", "schoolDistrict", "schoolSector", "school", "schoolLocation"].includes(p));
  assertCovered(abroad, ["country", "schoolName"], "student abroad");
  // A backend without the personal details or the interests: the basic form, in the same order.
  const legacy = visibleParts(STUDENT_PARTS, (p) => !["dateOfBirth", "homeCountry", "phone", "guardianPhone", "picture", "olympiadInterests", "schoolCountry", "schoolProvince", "schoolDistrict", "schoolSector", "school", "schoolNote", "homeProvince", "homeDistrict", "homeSector"].includes(p));
  assert.deepEqual(ids(legacy), ["firstName", "lastName", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "username", "email", "password", "confirm"]);
});

test("Teacher: every error of its rules and of the server has a field", () => {
  const own = [
    ...Object.keys(validateTeacherRegistration(emptyTeacherDraft())),
    ...Object.keys(validateTeacherRegistration({ ...emptyTeacherDraft(), schoolMode: "missing" })),
    ...Object.keys(validateTeacherExtra(emptyTeacherExtra())),
  ];
  assert.ok(own.includes("interests") && own.includes("proposedSchoolName") && own.includes("position"));
  const server = [...Object.values(TEACHER_ERROR_FIELDS), ...Object.values(TEACHER_SERVER_FIELDS)];
  assertCovered(TEACHER_PARTS, [...own, ...server, "picture", "password", "confirm"], "teacher");
  assert.deepEqual(ids(TEACHER_PARTS).slice(0, 2), ["firstName", "lastName"]);
  assert.deepEqual(ids(TEACHER_PARTS).slice(-3), ["username", "password", "confirm"]);
});

test("Coach: the details only with the coach application details; every error has a field", () => {
  // Without the coach application details: the name and the account only, as before.
  assert.deepEqual(ids(coachParts(false)), ["firstName", "lastName", "username", "email", "password", "confirm"]);
  const own = [
    "firstName", "lastName", "username", "email", "password", "confirm",
    ...Object.keys(validateCoachDetails({ ...emptyCoachDetails(), country: "" })),
    ...Object.keys(validateCoachExtra({ ...emptyCoachExtra(), affiliation: "x" })),
    "picture",
  ];
  assertCovered(coachParts(true), own, "coach");
  assert.deepEqual(ids(coachParts(true)), ids(COACH_PARTS));
  // The extra details and the picture follow the backend (present).
  assert.deepEqual(ids(coachParts(true, (p) => p !== "picture" && p !== "expertise")).includes("picture"), false);
});

test("the wide layout: a wide part spans both columns, a row part starts a new row; pairs stay together", () => {
  for (const parts of [STUDENT_PARTS, TEACHER_PARTS, COACH_PARTS]) {
    assert.ok(parts.every((p) => !(p.wide && p.row)), "a part is wide or starts a row, not both");
    assert.equal(parts.find((p) => p.id === "firstName").wide, undefined);
    assert.equal(parts.find((p) => p.id === "picture").wide, true);
  }
  assert.equal(STUDENT_PARTS.find((p) => p.id === "username").row, true);
});

// ─── The component ──────────────────────────────────────────────────────────────────────────────────────────────────

const PARTS = [{ id: "firstName", fields: ["firstName"] }, { id: "lastName", fields: ["lastName"] }, { id: "picture", fields: ["picture"], wide: true }, { id: "username", fields: ["username"], row: true }, { id: "absent", fields: ["absent"] }];

function render(extra = {}) {
  const content = { firstName: createElement("input", { name: "firstName", "aria-label": "First name" }), lastName: createElement("input", { name: "lastName", "aria-label": "Last name" }), picture: createElement("input", { name: "picture", type: "file", "aria-label": "Picture" }), username: createElement("input", { name: "username", "aria-label": "Username" }), absent: false };
  const noop = () => undefined;
  return renderToStaticMarkup(
    createElement(SignupForm, {
      focus: { event: extra.event ?? null, showErrors: noop, showMessage: noop },
      parts: PARTS,
      content,
      submitLabel: "Create my account",
      submittingLabel: "Creating your account…",
      submitting: !!extra.submitting,
      header: createElement("h1", null, "Join as a student"),
      footer: createElement("p", null, "Already have an account?"),
    }),
  );
}

test("component: every field in order, one submit button, no steps, progress, section headings, Next or Back", () => {
  const html = render();
  assert.deepEqual([...html.matchAll(/data-part="(\w+)"/g)].map((m) => m[1]), ["firstName", "lastName", "picture", "username"], "a part with no content is left out");
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /<button[^>]*type="submit"[^>]*>Create my account<\/button>/);
  assert.doesNotMatch(html, /<h2|Next|Back|Step \d|aria-current="step"|wizard/);
  // The heading first, the footer under the button.
  assert.ok(html.indexOf("Join as a student") < html.indexOf('data-part="firstName"'));
  assert.ok(html.indexOf("Create my account") < html.indexOf("Already have an account?"));
});

test("component: two columns above 640px, one on phones; wide parts span both, row parts start a new row", () => {
  const html = render();
  assert.match(html, /class="[^"]*grid-cols-1[^"]*sm:grid-cols-2[^"]*" data-testid="signup-fields"/);
  assert.match(html, /data-part="picture" class="min-w-0 empty:hidden sm:col-span-2"/);
  assert.match(html, /data-part="username" class="min-w-0 empty:hidden sm:col-start-1"/);
  assert.match(html, /data-part="firstName" class="min-w-0 empty:hidden "/);
});

test("component: errors are announced; while sending, the sending label", () => {
  assert.match(render({ event: { seq: 2, focus: "invalid" } }), /aria-live="polite"[^>]*>Please check the highlighted fields\.</);
  assert.doesNotMatch(render({ event: { seq: 1, focus: "message" } }), /Please check the highlighted fields/);
  assert.match(render({ submitting: true }), /Creating your account…/);
});

test("component: no gray-400 text (WCAG AA contrast)", () => {
  assert.doesNotMatch(render(), /text-(gray|slate)-400/);
});
