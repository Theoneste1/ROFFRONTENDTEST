// The multi-step registration forms: the wizard rules (lib/forms/wizard.ts), the steps of the Student, Teacher and Coach
// forms in both layouts (lib/forms/registration-steps.ts — every error their own rules or the server can produce opens
// exactly one step of each layout; a change of layout keeps the person on the field they were on), and the wizard
// component itself rendered with react-dom/server (app/components/forms/FormWizard.tsx): progress, aria-current, the live
// region, the hidden steps and the Back / Next / submit buttons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  INITIAL_WIZARD,
  buildSteps,
  clampStep,
  errorKeys,
  firstStepWithError,
  ignoreRepeatedClick,
  invalidAnnouncement,
  phaseOfStep,
  phaseStatus,
  phasesOf,
  pickStepErrors,
  progressLabel,
  remapStep,
  replaceStepErrors,
  screenLabel,
  stepAnnouncement,
  stepOfField,
  stepStatus,
  stepsSignature,
  wizardReducer,
} from "../lib/forms/wizard.ts";
import { COACH_PARTS, STUDENT_PARTS, TEACHER_PARTS, coachSteps, studentSteps, teacherSteps } from "../lib/forms/registration-steps.ts";
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

/** Each layout shows every part of the form once, in the form's order (so a new grouping never moves a part). */
function assertParts(steps, parts, what) {
  const ids = steps.flatMap((s) => s.parts.map((p) => p.id));
  assert.deepEqual(ids, parts.map((p) => p.id), `${what}: every part once, in the form's order`);
}

const LAYOUTS = ["wide", "narrow"];
const idOf = (steps, field) => steps[stepOfField(steps, field)].id;

test("buildSteps: a step keeps the parts the form shows, with their keys; a step left without any is dropped", () => {
  const parts = [{ id: "a", fields: ["a"] }, { id: "b", fields: ["b1", "b2"], wide: true }, { id: "c", fields: [] }, { id: "d", fields: ["d"] }];
  const plan = [{ id: "one", title: "One", parts: ["a", "b"] }, { id: "two", title: "Two", description: "Why", parts: ["c"] }, { id: "three", title: "Three", parts: ["d"] }];
  const all = buildSteps(parts, plan);
  assert.deepEqual(all.map((s) => [s.id, s.fields]), [["one", ["a", "b1", "b2"]], ["two", []], ["three", ["d"]]]);
  assert.equal(all[1].description, "Why");
  assert.deepEqual(all[0].parts.map((p) => [p.id, p.order, !!p.wide]), [["a", 0, false], ["b", 1, true]]);
  const some = buildSteps(parts, plan, (p) => p !== "c" && p !== "b");
  assert.deepEqual(some.map((s) => [s.id, s.fields]), [["one", ["a"]], ["three", ["d"]]]);
});

test("remapStep: a new grouping shows the step holding the part the person was on, else the shown step's first part still there", () => {
  const parts = ["a", "b", "c", "d", "e"].map((id) => ({ id, fields: [id] }));
  const wide = buildSteps(parts, [{ id: "1", title: "1", parts: ["a", "b", "c"] }, { id: "2", title: "2", parts: ["d", "e"] }]);
  const narrow = buildSteps(parts, [{ id: "1", title: "1", parts: ["a"] }, { id: "2", title: "2", parts: ["b", "c"] }, { id: "3", title: "3", parts: ["d"] }, { id: "4", title: "4", parts: ["e"] }]);
  assert.equal(remapStep(wide, narrow, 0, "c"), 1, "on c: its narrow step");
  assert.equal(remapStep(wide, narrow, 0, null), 0, "no field: the step of the shown step's first part");
  assert.equal(remapStep(wide, narrow, 1, "a"), 2, "a part of another step does not count");
  assert.equal(remapStep(narrow, wide, 3, "e"), 1);
  assert.equal(remapStep(narrow, wide, 2, null), 1);
  // The part the person was on is gone (e.g. a school abroad has no province): the shown step's next part.
  const without = buildSteps(parts, [{ id: "1", title: "1", parts: ["a"] }, { id: "2", title: "2", parts: ["b", "c"] }], (p) => p !== "b");
  assert.equal(remapStep(narrow, without, 1, "b"), 1);
  assert.equal(remapStep(narrow, without, 3, "e"), 1, "nothing of the shown step is left: the nearest step");
  assert.notEqual(stepsSignature(wide), stepsSignature(narrow));
  assert.equal(stepsSignature(wide), stepsSignature(buildSteps(parts, [{ id: "1", title: "1", parts: ["a", "b", "c"] }, { id: "2", title: "2", parts: ["d", "e"] }])));
});

test("Student: the steps of both layouts in order, and every error of its rules and of the server opens a step", () => {
  assert.deepEqual(studentSteps("wide").map((s) => s.title), ["About you", "Phone and picture", "Your studies", "School location", "Your school", "Where you live", "Your account"]);
  assert.deepEqual(studentSteps("narrow").map((s) => s.title), [
    "About you", "Birth and country", "Phone numbers", "Profile picture", "Your studies", "School location", "School district and sector", "Your school", "Where you live",
    "Your account", "Your password",
  ]);
  // RegisterForm's own validate() (FIELDS + confirm), the school claim in every mode, the personal details, the picture.
  const form = ["firstName", "lastName", "username", "email", "password", "confirm", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "olympiadInterests"];
  const claim = ["directory", "notListed", "abroad"].flatMap((m) => Object.keys(validateSchoolClaim(emptyDraft(m))));
  const details = [
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "" })),
    ...Object.keys(validateStudentDetails({ ...emptyStudentDetails(), homeCountry: "KE" })),
  ];
  const server = [...Object.values(SCHOOL_CLAIM_SERVER_FIELDS), ...Object.values(STUDENT_DETAILS_ERRORS).map((e) => e.field), ...STUDENT_DETAILS_SERVER_FIELDS];
  assert.ok(claim.length > 0 && details.length > 0);
  for (const layout of LAYOUTS) {
    const steps = studentSteps(layout);
    assertCovered(steps, [...form, ...claim, ...details, ...server, "picture"], `student ${layout}`);
    assertParts(steps, STUDENT_PARTS, `student ${layout}`);
    // Where each group lives.
    assert.equal(idOf(steps, "dateOfBirth"), layout === "wide" ? "about" : "birth");
    assert.equal(idOf(steps, "guardianPhone"), layout === "wide" ? "contact" : "phones");
    assert.equal(idOf(steps, "olympiadInterests"), "studies");
    assert.equal(idOf(steps, "province"), "school-place");
    assert.equal(idOf(steps, "school"), "school");
    assert.equal(idOf(steps, "schoolName"), "school");
    assert.equal(idOf(steps, "homeSector"), "home");
    assert.equal(idOf(steps, "confirm"), "account");
  }
  // The school mode decides which school parts are shown (a school abroad: country and name), each key still on one step.
  const abroad = (p) => !["schoolProvince", "schoolDistrict", "schoolSector", "school", "schoolLocation"].includes(p);
  for (const layout of LAYOUTS) {
    const steps = studentSteps(layout, abroad);
    assertCovered(steps, ["country", "schoolName"], `student ${layout} abroad`);
    assert.equal(steps.some((s) => s.id === "school-area"), false, "no empty step");
  }
  // A backend without the personal details or the interests: those steps are not shown.
  const legacy = studentSteps("narrow", (p) => !["dateOfBirth", "homeCountry", "phone", "guardianPhone", "picture", "olympiadInterests", "schoolCountry", "schoolProvince", "schoolDistrict", "schoolSector", "school", "schoolNote", "homeProvince", "homeDistrict", "homeSector"].includes(p));
  assert.deepEqual(legacy.map((s) => s.id), ["about", "studies", "school", "home", "login", "account"]);
});

test("Teacher: the steps of both layouts in order, and every error of its rules and of the server opens a step", () => {
  assert.deepEqual(teacherSteps("wide").map((s) => s.title), ["About you", "Your teaching", "Profile picture", "School location", "Your school", "Home location", "Your account"]);
  assert.deepEqual(teacherSteps("narrow").map((s) => s.title), [
    "About you", "Contact details", "Country", "Your teaching", "Olympiad interests", "Profile picture", "School location", "School district and sector", "Your school",
    "School name", "Home location", "Your username", "Your password",
  ]);
  const own = [
    ...Object.keys(validateTeacherRegistration(emptyTeacherDraft())),
    ...Object.keys(validateTeacherRegistration({ ...emptyTeacherDraft(), schoolMode: "missing" })),
    ...Object.keys(validateTeacherExtra(emptyTeacherExtra())),
  ];
  assert.ok(own.includes("interests") && own.includes("proposedSchoolName") && own.includes("position"));
  const server = [...Object.values(TEACHER_ERROR_FIELDS), ...Object.values(TEACHER_SERVER_FIELDS)];
  for (const layout of LAYOUTS) {
    const steps = teacherSteps(layout);
    assertCovered(steps, [...own, ...server, "picture", "password", "confirm"], `teacher ${layout}`);
    assertParts(steps, TEACHER_PARTS, `teacher ${layout}`);
    assert.equal(idOf(steps, "position"), "teaching");
    assert.equal(idOf(steps, "interests"), layout === "wide" ? "teaching" : "interests");
    assert.equal(idOf(steps, "schoolProvince"), "school-place");
    assert.equal(idOf(steps, "proposedSchoolName"), layout === "wide" ? "school" : "school-name");
    assert.equal(idOf(steps, "homeDistrict"), "home");
    assert.equal(idOf(steps, "confirm"), "account");
    // The explanations the sections had stay under the step headings.
    assert.match(steps.find((s) => s.id === "school").description, /official list of Rwandan schools/);
    assert.match(steps.find((s) => s.id === "home").description, /separate from your school/);
  }
});

test("Coach: About you, the details (only with the application details) and the account in both layouts; every error opens a step", () => {
  assert.deepEqual(coachSteps("wide", true).map((s) => s.title), ["About you", "Profile picture", "Your background", "Your experience", "Your account"]);
  assert.deepEqual(coachSteps("narrow", true).map((s) => s.title), [
    "About you", "Country and phone", "Profile picture", "Your background", "Affiliation", "Olympiad subjects", "Your expertise", "Your experience", "Your account", "Your password",
  ]);
  // Without the coach application details: the name and the account only, as before.
  assert.deepEqual(coachSteps("wide", false).map((s) => s.title), ["About you", "Your account"]);
  assert.deepEqual(coachSteps("narrow", false).map((s) => s.title), ["About you", "Your account", "Your password"]);
  assert.deepEqual(coachSteps("wide", false).flatMap((s) => s.fields), ["firstName", "lastName", "username", "email", "password", "confirm"]);
  const own = [
    "firstName", "lastName", "username", "email", "password", "confirm",
    ...Object.keys(validateCoachDetails({ ...emptyCoachDetails(), country: "" })),
    ...Object.keys(validateCoachExtra({ ...emptyCoachExtra(), affiliation: "x" })),
    "picture",
  ];
  for (const layout of LAYOUTS) {
    const steps = coachSteps(layout, true);
    assertCovered(steps, own, `coach ${layout}`);
    assertParts(steps, COACH_PARTS, `coach ${layout}`);
    assert.equal(idOf(steps, "olympiadInterests"), layout === "wide" ? "background" : "interests");
    assert.equal(idOf(steps, "country"), layout === "wide" ? "about" : "contact");
    assert.equal(idOf(steps, "relevantExperience"), "experience");
  }
});

test("a form's two layouts hold the same parts: crossing 640px always finds the field the person was on", () => {
  for (const [what, wide, narrow] of [
    ["student", studentSteps("wide"), studentSteps("narrow")],
    ["teacher", teacherSteps("wide"), teacherSteps("narrow")],
    ["coach", coachSteps("wide", true), coachSteps("narrow", true)],
  ]) {
    for (const [i, step] of wide.entries())
      for (const p of step.parts) {
        const n = remapStep(wide, narrow, i, p.id);
        assert.ok(narrow[n].parts.some((q) => q.id === p.id), `${what}: ${p.id} wide → narrow`);
        assert.equal(remapStep(narrow, wide, n, p.id), i, `${what}: ${p.id} narrow → wide`);
      }
    // Narrow steps are the wide steps cut smaller: each lies inside one wide step.
    for (const step of narrow) assert.equal(new Set(step.parts.map((p) => wide.findIndex((w) => w.parts.some((q) => q.id === p.id)))).size, 1, `${what}: ${step.id} inside one wide step`);
  }
});

// ─── Phases ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test("phases: consecutive steps of a phase form one phase; where a step is inside its phase", () => {
  const A = { id: "a", title: "About you" };
  const B = { id: "b", title: "Account" };
  const steps = [
    { id: "s1", title: "Names", phase: A },
    { id: "s2", title: "Picture", phase: A },
    { id: "s3", title: "Alone" },
    { id: "s4", title: "Login", phase: B },
    { id: "s5", title: "Password", phase: B },
    { id: "s6", title: "Done", phase: B },
  ];
  const phases = phasesOf(steps);
  assert.deepEqual(phases, [
    { id: "a", title: "About you", first: 0, count: 2 },
    { id: "s3", title: "Alone", first: 2, count: 1 },
    { id: "b", title: "Account", first: 3, count: 3 },
  ]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => phaseOfStep(phases, i)), [0, 0, 1, 2, 2, 2, -1]);
  assert.deepEqual([0, 1, 2].map((p) => phaseStatus(phases, p, 4)), ["complete", "complete", "current"]);
  assert.deepEqual([0, 1, 2].map((p) => phaseStatus(phases, p, 1)), ["current", "upcoming", "upcoming"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => screenLabel(phases, i)), ["1 of 2", "2 of 2", null, "1 of 3", "2 of 3", "3 of 3"]);
  // A step without a phase is a phase of its own (the steps of a form that has none: one circle per step).
  assert.deepEqual(phasesOf(STEPS).map((p) => p.title), ["About you", "Your studies", "Your account"]);
});

test("the forms' phases: 3 or 4 named phases, the same in both layouts, each part in the same phase in both", () => {
  const titles = (steps) => phasesOf(steps).map((p) => p.title);
  for (const [what, wide, narrow, expected] of [
    ["student", studentSteps("wide"), studentSteps("narrow"), ["About you", "Studies & school", "Home", "Account"]],
    ["teacher", teacherSteps("wide"), teacherSteps("narrow"), ["About you", "Teaching", "School & home", "Account"]],
    ["coach", coachSteps("wide", true), coachSteps("narrow", true), ["About you", "Background", "Account"]],
  ]) {
    assert.deepEqual(titles(wide), expected, `${what} wide`);
    assert.deepEqual(titles(narrow), expected, `${what} narrow`);
    for (const steps of [wide, narrow]) {
      assert.ok(steps.every((s) => s.phase), `${what}: every step has a phase`);
      // A phase is never split by another one (each phase's steps are in a row).
      assert.equal(phasesOf(steps).length, new Set(steps.map((s) => s.phase.id)).size, `${what}: phases in a row`);
    }
    const phaseOfPart = (steps) => Object.fromEntries(steps.flatMap((s) => s.parts.map((p) => [p.id, s.phase.id])));
    assert.deepEqual(phaseOfPart(narrow), phaseOfPart(wide), `${what}: a part keeps its phase across 640px`);
  }
  // Phones: more screens per phase.
  assert.deepEqual(phasesOf(studentSteps("narrow")).map((p) => p.count), [4, 4, 1, 2]);
  assert.deepEqual(phasesOf(studentSteps("wide")).map((p) => p.count), [2, 3, 1, 1]);
  // Without the coach application details: About you and Account.
  assert.deepEqual(titles(coachSteps("wide", false)), ["About you", "Account"]);
});

// ─── The component ──────────────────────────────────────────────────────────────────────────────────────────────────

function wizardAt(index, count, event = null) {
  const noop = () => undefined;
  return { index, count, isFirst: index === 0, isLast: index >= count - 1, event, next: noop, back: noop, showErrors: noop, showMessage: noop, setAnchor: noop };
}

/** STEPS with one part per field (the second part of "Your account" spans both columns). */
const PART_STEPS = buildSteps(
  STEPS.flatMap((s) => s.fields.map((f) => (f === "password" ? { id: f, fields: [f], wide: true } : { id: f, fields: [f] }))),
  STEPS.map((s) => ({ id: s.id, title: s.title, parts: s.fields })),
);

function render(index, extra = {}) {
  const parts = Object.fromEntries(PART_STEPS.flatMap((s) => s.parts).map((p) => [p.id, createElement("input", { name: p.id, "aria-label": p.id })]));
  return renderToStaticMarkup(
    createElement(FormWizard, {
      wizard: wizardAt(index, PART_STEPS.length, extra.event ?? null),
      steps: PART_STEPS,
      parts,
      submitLabel: "Create my account",
      submittingLabel: "Creating your account…",
      submitting: !!extra.submitting,
      footer: createElement("p", null, "Already have an account?"),
    }),
  );
}

/** The heading of each step: whether it is hidden. */
function sections(html) {
  return [...html.matchAll(/<div([^>]*)data-testid="wizard-step-(\w)"/g)].map((m) => ({ id: m[2], hidden: /\bhidden=""/.test(m[1]) }));
}

/** The parts shown (every part is in the page; only the shown step's are visible). */
function shownParts(html) {
  return [...html.matchAll(/<div([^>]*)data-part="(\w+)"([^>]*)>/g)].filter((m) => !/\bhidden=""/.test(m[1] + m[3])).map((m) => m[2]);
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
  assert.deepEqual(shownParts(html), ["firstName", "lastName"]);
  assert.doesNotMatch(html, /data-testid="wizard-back"/);
  // "Next" and an arrow drawn beside it (hidden from assistive technology: the button is named "Next").
  assert.match(html, /<button[^>]*type="submit"[^>]*data-testid="wizard-next"[^>]*>Next<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><\/button>/);
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
  assert.deepEqual(shownParts(html), ["gradeLevel"]);
  assert.match(html, /data-testid="wizard-back"[^>]*>Back<\/button>/);
  assert.match(html, />Next<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><\/button>/);
  assert.match(html, /data-testid="wizard-live">Step 2 of 3: Your studies <\/p>/);
});

test("component, last step: the form's own submit label; errors are announced; while sending, the sending label", () => {
  const html = render(2, { event: { seq: 2, focus: "invalid" } });
  assert.match(html, /Step 3 of 3/);
  assert.match(html, /data-testid="wizard-submit"[^>]*>Create my account<\/button>/);
  assert.doesNotMatch(html, />Next</);
  assert.match(html, /Step 3 of 3: Your account\. Please check the highlighted fields\./);
  assert.match(render(2, { submitting: true }), /Creating your account…/);
  assert.deepEqual(shownParts(html), ["username", "password", "confirm"]);
});

test("component, wide layout: two columns, wide parts span both; Back left, Next right, never stretched; the footer between", () => {
  const html = render(2);
  assert.match(html, /data-layout="wide"/);
  assert.match(html, /class="[^"]*wizard-wide:grid-cols-2[^"]*" data-testid="wizard-fields"/);
  assert.match(html, /data-part="password" data-shown="true" class="[^"]*wizard-wide:col-span-2/);
  assert.doesNotMatch(html, /data-part="username" data-shown="true" class="[^"]*col-span-2/);
  // Back, then the submit button pushed to the right, then the footer under them; at least 120px wide, never full width.
  const actions = html.slice(html.indexOf('data-testid="wizard-actions"'));
  assert.ok(actions.indexOf("wizard-back") < actions.indexOf("wizard-submit") && actions.indexOf("wizard-submit") < actions.indexOf("Already have an account?"));
  for (const b of actions.match(/<button[^>]*>/g)) {
    assert.match(b, /min-w-\[120px\]/);
    assert.doesNotMatch(b, /\b(w-full|flex-1)\b/);
  }
  // "Step 3 of 3" and the title beside the step heading: said, not shown (the phases above show the progress; a step
  // that is the only one of its phase has no "2 of 3").
  assert.match(html, /data-testid="wizard-progress"><span class="sr-only">Step 3 of 3 · Your account<\/span><\/p>/);
});

test("component: no gray-400 text (WCAG AA contrast), the design's numbered circles and colours", () => {
  const html = render(1);
  assert.doesNotMatch(html, /(text|placeholder)-(gray|slate)-400/);
  assert.match(html, /data-status="complete" data-phase="a"><span class="[^"]*rounded-full[^"]*bg-brand text-white"[^>]*><svg[^>]*lucide-check/, "completed step: filled, with a check mark");
  assert.match(html, /data-status="current" data-phase="b"><span[^>]*><\/span><span class="[^"]*bg-brand text-white ring-4 ring-brand\/15"[^>]*>2</, "current step: filled blue, numbered");
});

test("component, phases: one circle per phase, the current phase marked, '2 of 2' inside a phase of several steps", () => {
  const P = { id: "p", title: "About you" };
  const Q = { id: "q", title: "Account" };
  const steps = buildSteps(
    ["firstName", "picture", "username"].map((f) => ({ id: f, fields: [f] })),
    [
      { id: "a", title: "Names", phase: P, parts: ["firstName"] },
      { id: "b", title: "Picture", phase: P, parts: ["picture"] },
      { id: "c", title: "Login", phase: Q, parts: ["username"] },
    ],
  );
  const parts = Object.fromEntries(["firstName", "picture", "username"].map((f) => [f, createElement("input", { name: f, "aria-label": f })]));
  const at = (index) =>
    renderToStaticMarkup(createElement(FormWizard, { wizard: wizardAt(index, steps.length), steps, parts, submitLabel: "Send", submittingLabel: "Sending…" }));
  const second = at(1);
  assert.equal((second.match(/<li /g) ?? []).length, 2);
  assert.match(second, /<li aria-current="step"[^>]*data-status="current" data-phase="p"/);
  assert.match(second, /About you \(current step\)/);
  assert.match(second, /Account \(not started\)/);
  assert.match(second, /data-testid="wizard-screen">2 of 2<\/span>/);
  assert.match(second, /Step 2 of 3 · Picture/);
  // The last phase, one step: the first phase completed, no "2 of 2".
  const third = at(2);
  assert.match(third, /data-status="complete" data-phase="p"/);
  assert.match(third, /<li aria-current="step"[^>]*data-phase="q"/);
  assert.doesNotMatch(third, /data-testid="wizard-screen"/);
  // The first step: Cancel (a link to the home page) instead of Back.
  assert.match(at(0), /<a [^>]*data-testid="wizard-cancel" href="\/">Cancel<\/a>/);
  assert.doesNotMatch(at(0), /wizard-back/);
});
