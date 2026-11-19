// The multi-step registration forms: the wizard rules (lib/forms/wizard.ts), the steps of the Student, Teacher and Coach
// forms (lib/forms/registration-steps.ts — every error their own rules or the server can produce opens exactly one step),
// and the wizard component itself rendered with react-dom/server (app/components/forms/FormWizard.tsx): progress,
// aria-current, the live region, the hidden steps and the Back / Next / submit buttons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  INITIAL_WIZARD,
  clampStep,
  errorKeys,
  firstStepWithError,
  ignoreRepeatedClick,
  invalidAnnouncement,
  pickStepErrors,
  progressLabel,
  replaceStepErrors,
  stepAnnouncement,
  stepOfField,
  stepStatus,
  wizardReducer,
} from "../lib/forms/wizard.ts";
import { STUDENT_STEPS, TEACHER_STEPS, coachSteps } from "../lib/forms/registration-steps.ts";
import { SCHOOL_CLAIM_SERVER_FIELDS, validateSchoolClaim } from "../lib/accounts/school-claim.ts";
import { STUDENT_DETAILS_ERRORS, STUDENT_DETAILS_SERVER_FIELDS, emptyStudentDetails, validateStudentDetails } from "../lib/accounts/student-details.ts";
import { TEACHER_ERROR_FIELDS, TEACHER_SERVER_FIELDS, emptyTeacherDraft, validateTeacherRegistration } from "../lib/accounts/teacher-registration.ts";
import { emptyCoachExtra, emptyTeacherExtra, validateCoachExtra, validateTeacherExtra } from "../lib/accounts/application-details.ts";
import { emptyCoachDetails, validateCoachDetails } from "../lib/accounts/coach-application.ts";
import { emptyDraft } from "../app/components/account/SchoolClaimFields.tsx";
import FormWizard from "../app/components/forms/FormWizard.tsx";

const STEPS = [
  { id: "a", title: "About you", fields: ["firstName", "lastName"] },
  { id: "b", title: "Your studies", fields: ["gradeLevel"] },
  { id: "c", title: "Your account", fields: ["username", "password", "confirm"] },
];

// ─── Rules ──────────────────────────────────────────────────────────────────────────────────────────────────────────

test("progress texts: 'Step 2 of 4', the step's status and what the live region announces", () => {
  assert.equal(progressLabel(1, 4), "Step 2 of 4");
  assert.deepEqual([0, 1, 2].map((i) => stepStatus(i, 1)), ["complete", "current", "upcoming"]);
  assert.equal(stepAnnouncement(STEPS, 1), "Step 2 of 3: Your studies");
  assert.equal(invalidAnnouncement(STEPS, 0), "Step 1 of 3: About you. Please check the highlighted fields.");
});

test("a field's step; the first step holding an error (unknown keys ignored, -1 when none)", () => {
  assert.equal(stepOfField(STEPS, "gradeLevel"), 1);
  assert.equal(stepOfField(STEPS, "nope"), -1);
  assert.equal(firstStepWithError(STEPS, ["password", "gradeLevel"]), 1);
  assert.equal(firstStepWithError(STEPS, ["confirm"]), 2);
  assert.equal(firstStepWithError(STEPS, ["nope"]), -1);
  assert.equal(firstStepWithError(STEPS, []), -1);
});

test("error keys only count errors that are set (a cleared field holds undefined; no picture problem is null)", () => {
  assert.deepEqual(errorKeys({ firstName: "Enter your first name.", lastName: undefined }, { picture: null }, null, { gradeLevel: "Choose your grade." }), [
    "firstName",
    "gradeLevel",
  ]);
});

test("checking one step keeps only its errors; errors already shown on other steps stay until they are checked", () => {
  const all = { firstName: "Enter your first name.", gradeLevel: "Choose your grade.", password: "Too short." };
  assert.deepEqual(pickStepErrors(STEPS[0], all), { firstName: "Enter your first name." });
  // A refused username is shown on step 3; going back to step 1 and passing it does not hide it.
  assert.deepEqual(replaceStepErrors(STEPS[0], { username: "taken", firstName: "old" }, {}), { username: "taken" });
  assert.deepEqual(replaceStepErrors(STEPS[0], { username: "taken" }, all), { username: "taken", firstName: "Enter your first name." });
});

test("Next / Back stay inside the form; errors show the given step (or the shown one) and focus its first highlighted field", () => {
  let s = INITIAL_WIZARD;
  assert.deepEqual(s, { index: 0, seq: 0, focus: null });
  s = wizardReducer(3, s, { type: "back" });
  assert.equal(s.index, 0, "no step before the first");
  s = wizardReducer(3, s, { type: "next" });
  s = wizardReducer(3, s, { type: "next" });
  s = wizardReducer(3, s, { type: "next" });
  assert.deepEqual(s, { index: 2, seq: 4, focus: "heading" }, "no step after the last");
  s = wizardReducer(3, s, { type: "back" });
  assert.equal(s.index, 1);
  s = wizardReducer(3, s, { type: "errors", step: 0 });
  assert.deepEqual(s, { index: 0, seq: 6, focus: "invalid" });
  s = wizardReducer(3, { ...s, index: 2 }, { type: "errors" });
  assert.equal(s.index, 2, "no step given: the shown one");
  assert.equal(wizardReducer(3, s, { type: "errors", step: -1 }).index, 2, "an error on no step: stay");
  assert.equal(wizardReducer(2, { index: 2, seq: 0, focus: null }, { type: "next" }).index, 1, "a form that lost a step stays inside it");
  // A refusal naming no field: same step, its message brought into view.
  assert.deepEqual(wizardReducer(3, { index: 2, seq: 7, focus: "invalid" }, { type: "message" }), { index: 2, seq: 8, focus: "message" });
  assert.equal(clampStep(9, 3), 2);
  assert.equal(clampStep(-1, 3), 0);
});

test("a double click on Next never lands on the submit button: only the second click of a double click is ignored", () => {
  assert.equal(ignoreRepeatedClick(0), false, "Enter in a field (implicit submission)");
  assert.equal(ignoreRepeatedClick(1), false);
  assert.equal(ignoreRepeatedClick(2), true);
});

// ─── The three forms' steps ─────────────────────────────────────────────────────────────────────────────────────────

/** Every key belongs to exactly one step, and the steps share no key. */
function assertCovered(steps, keys, what) {
  const all = steps.flatMap((s) => s.fields);
  assert.equal(new Set(all).size, all.length, `${what}: a key on two steps`);
  for (const k of keys) assert.notEqual(stepOfField(steps, k), -1, `${what}: "${k}" is on no step`);
}

test("Student: the five sections in order, and every error of its rules and of the server opens a step", () => {
  assert.deepEqual(STUDENT_STEPS.map((s) => s.title), ["About you", "Your studies", "Your school", "Where you live", "Your account"]);
  // RegisterForm's own validate() (FIELDS + confirm), the school claim in every mode, the personal details, the picture.
  const form = ["firstName", "lastName", "username", "email", "password", "confirm", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "olympiadInterests"];
  const claim = ["directory", "notListed", "abroad"].flatMap((m) => Object.keys(validateSchoolClaim(emptyDraft(m))));
  const details = [
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "" })),
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "KE" })),
  ];
  const server = [...Object.values(SCHOOL_CLAIM_SERVER_FIELDS), ...Object.values(STUDENT_DETAILS_ERRORS).map((e) => e.field), ...STUDENT_DETAILS_SERVER_FIELDS];
  assert.ok(claim.length > 0 && details.length > 0);
  assertCovered(STUDENT_STEPS, [...form, ...claim, ...details, ...server, "picture"], "student");
  // Where each group lives.
  assert.equal(STUDENT_STEPS[stepOfField(STUDENT_STEPS, "dateOfBirth")].id, "about");
  assert.equal(STUDENT_STEPS[stepOfField(STUDENT_STEPS, "olympiadInterests")].id, "studies");
  assert.equal(STUDENT_STEPS[stepOfField(STUDENT_STEPS, "school")].id, "school");
  assert.equal(STUDENT_STEPS[stepOfField(STUDENT_STEPS, "homeSector")].id, "home");
  assert.equal(STUDENT_STEPS[stepOfField(STUDENT_STEPS, "confirm")].id, "account");
});

test("Teacher: the five sections in order, and every error of its rules and of the server opens a step", () => {
  assert.deepEqual(TEACHER_STEPS.map((s) => s.title), ["About you", "Olympiad interests", "Your school", "Home location", "Your account"]);
  const own = [
    ...Object.keys(validateTeacherRegistration(emptyTeacherDraft())),
    ...Object.keys(validateTeacherRegistration({ ...emptyTeacherDraft(), schoolMode: "missing" })),
    ...Object.keys(validateTeacherExtra(emptyTeacherExtra())),
  ];
  assert.ok(own.includes("interests") && own.includes("proposedSchoolName") && own.includes("position"));
  const server = [...Object.values(TEACHER_ERROR_FIELDS), ...Object.values(TEACHER_SERVER_FIELDS)];
  assertCovered(TEACHER_STEPS, [...own, ...server, "picture", "password", "confirm"], "teacher");
  assert.equal(TEACHER_STEPS[stepOfField(TEACHER_STEPS, "position")].id, "about");
  assert.equal(TEACHER_STEPS[stepOfField(TEACHER_STEPS, "interests")].id, "interests");
  assert.equal(TEACHER_STEPS[stepOfField(TEACHER_STEPS, "proposedSchoolName")].id, "school");
  assert.equal(TEACHER_STEPS[stepOfField(TEACHER_STEPS, "homeDistrict")].id, "home");
  assert.equal(TEACHER_STEPS[stepOfField(TEACHER_STEPS, "confirm")].id, "account");
  // The explanations the numbered sections had stay under the step headings.
  assert.match(TEACHER_STEPS[1].description, /Choose at least one/);
});

test("Coach: About you, Your background (only with the application details), Your account; every error opens a step", () => {
  assert.deepEqual(coachSteps(true).map((s) => s.title), ["About you", "Your background", "Your account"]);
  assert.deepEqual(coachSteps(false).map((s) => s.title), ["About you", "Your account"]);
  const own = [
    "firstName", "lastName", "username", "email", "password", "confirm",
    ...Object.keys(validateCoachDetails({ ...emptyCoachDetails(), country: "" })),
    ...Object.keys(validateCoachExtra({ ...emptyCoachExtra(), affiliation: "x" })),
    "picture",
  ];
  assertCovered(coachSteps(true), own, "coach");
  assert.equal(coachSteps(true)[stepOfField(coachSteps(true), "olympiadInterests")].id, "background");
  assert.equal(coachSteps(true)[stepOfField(coachSteps(true), "country")].id, "about");
});

// ─── The component ──────────────────────────────────────────────────────────────────────────────────────────────────

function wizardAt(index, count, event = null) {
  const noop = () => undefined;
  return { index, count, isFirst: index === 0, isLast: index >= count - 1, event, next: noop, back: noop, showErrors: noop, showMessage: noop };
}

function render(index, extra = {}) {
  const steps = STEPS.map((s) => ({ ...s, content: createElement("input", { name: s.fields[0], "aria-label": s.fields[0] }) }));
  return renderToStaticMarkup(
    createElement(FormWizard, { wizard: wizardAt(index, steps.length, extra.event ?? null), steps, submitLabel: "Create my account", submittingLabel: "Creating your account…", submitting: !!extra.submitting }),
  );
}

/** The <section> of each step: whether it is hidden. */
function sections(html) {
  return [...html.matchAll(/<section([^>]*)data-testid="wizard-step-(\w)"/g)].map((m) => ({ id: m[2], hidden: /\bhidden=""/.test(m[1]) }));
}

test("component, first step: 'Step 1 of 3', the first step is current, only its fields are shown, Next and no Back", () => {
  const html = render(0);
  assert.match(html, /Step 1 of 3/);
  assert.match(html, /<li aria-current="step"[^>]*data-status="current"/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.deepEqual(sections(html), [
    { id: "a", hidden: false },
    { id: "b", hidden: true },
    { id: "c", hidden: true },
  ]);
  // Every step stays in the page (nothing typed is lost); the hidden ones are not shown.
  for (const f of ["firstName", "gradeLevel", "username"]) assert.match(html, new RegExp(`name="${f}"`));
  assert.doesNotMatch(html, /data-testid="wizard-back"/);
  assert.match(html, /<button[^>]*type="submit"[^>]*data-testid="wizard-next"[^>]*>Next<\/button>/);
  assert.match(html, /aria-label="Registration steps"/);
  // The live region exists from the start and says nothing until a step changes.
  assert.match(html, /<p class="sr-only" aria-live="polite" aria-atomic="true" data-testid="wizard-live"><\/p>/);
  // Step headings can take focus (Next / Back move focus there).
  assert.match(html, /<h2 id="[^"]+" tabindex="-1"/);
});

test("component, a middle step: earlier steps completed, Back and Next, the step announced", () => {
  const html = render(1, { event: { seq: 1, focus: "heading" } });
  assert.match(html, /Step 2 of 3/);
  assert.match(html, /data-status="complete"[\s\S]*About you \(completed\)/);
  assert.match(html, /Your studies \(current step\)/);
  assert.match(html, /Your account \(not started\)/);
  assert.deepEqual(sections(html).map((s) => s.hidden), [true, false, true]);
  assert.match(html, /data-testid="wizard-back"[^>]*>Back<\/button>/);
  assert.match(html, />Next<\/button>/);
  assert.match(html, /data-testid="wizard-live">Step 2 of 3: Your studies <\/p>/);
});

test("component, last step: the form's own submit label; errors are announced; while sending, the sending label", () => {
  const html = render(2, { event: { seq: 2, focus: "invalid" } });
  assert.match(html, /Step 3 of 3/);
  assert.match(html, /data-testid="wizard-submit"[^>]*>Create my account<\/button>/);
  assert.doesNotMatch(html, />Next</);
  assert.match(html, /Step 3 of 3: Your account\. Please check the highlighted fields\./);
  assert.match(render(2, { submitting: true }), /Creating your account…/);
});

test("component: no gray-400 text (WCAG AA contrast), the design's numbered circles and colours", () => {
  const html = render(1);
  assert.doesNotMatch(html, /(text|placeholder)-(gray|slate)-400/);
  assert.match(html, /data-status="complete"><span class="[^"]*rounded-full[^"]*bg-\[#2B2BB2\] text-white/, "completed step");
  assert.match(html, /ring-2 ring-\[#2B2BB2\]/, "current step");
});
