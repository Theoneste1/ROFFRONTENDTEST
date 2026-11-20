// The multi-step form (used by the administrators' test creation): the wizard rules (lib/forms/wizard.ts) and the wizard
// component itself rendered with react-dom/server (app/components/forms/FormWizard.tsx): progress, aria-current, the live
// region, the hidden steps and the Back / Next / submit buttons. The registration forms are one continuous form:
// tests/registration-fields.test.mjs.
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

// ─── Steps and phases ──────────────────────────────────────────────────────────────────────────────────────────────

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
