// Application details and requests for more information (lib/accounts/application-details.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  answerBody,
  answerProblems,
  applicationDetailsSupported,
  coachExtraPayload,
  emptyCoachExtra,
  emptyTeacherExtra,
  infoRequestState,
  latestAnswer,
  openInfoRequest,
  parseYears,
  questionProblem,
  teacherExtraPayload,
  validateCoachExtra,
  validateTeacherExtra,
} from "../lib/accounts/application-details.ts";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const req = (over = {}) => ({ id: "r", question: "Q?", requestedAt: "2026-11-16T00:00:00Z", expiresAt: "2026-11-30T00:00:00Z", answer: null, answeredAt: null, cancelledAt: null, requestedBy: null, ...over });

test("capability gate", () => {
  assert.equal(applicationDetailsSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["applicationDetails"] }), true);
  assert.equal(applicationDetailsSupported({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(applicationDetailsSupported({ state: "LEGACY" }), false);
});

test("years of experience: empty, 0–60, anything else invalid", () => {
  assert.equal(parseYears(""), undefined);
  assert.equal(parseYears(" 7 "), 7);
  assert.equal(parseYears("0"), 0);
  assert.equal(parseYears("60"), 60);
  assert.ok(Number.isNaN(parseYears("61")));
  assert.ok(Number.isNaN(parseYears("3.5")));
  assert.ok(Number.isNaN(parseYears("-1")));
});

test("Teacher: position required, years optional; payload trims and omits empty years", () => {
  assert.deepEqual(Object.keys(validateTeacherExtra(emptyTeacherExtra())), ["position"]);
  assert.deepEqual(validateTeacherExtra({ position: "Mathematics teacher", yearsOfExperience: "" }), {});
  assert.ok(validateTeacherExtra({ position: "Head", yearsOfExperience: "99" }).yearsOfExperience);
  assert.deepEqual(teacherExtraPayload({ position: "  Head of sciences ", yearsOfExperience: "" }), { position: "Head of sciences" });
  assert.deepEqual(teacherExtraPayload({ position: "Teacher", yearsOfExperience: "12" }), { position: "Teacher", yearsOfExperience: 12 });
});

test("Coach: phone, expertise, experience required; affiliation and years optional", () => {
  assert.deepEqual(Object.keys(validateCoachExtra(emptyCoachExtra())).sort(), ["expertise", "phone", "relevantExperience"]);
  const ok = { phone: "0788 123 456", affiliation: "", expertise: "Number theory", relevantExperience: "IMO coach", yearsOfExperience: "" };
  assert.deepEqual(validateCoachExtra(ok), {});
  assert.ok(validateCoachExtra({ ...ok, affiliation: "x" }).affiliation);
  assert.deepEqual(coachExtraPayload(ok), { phone: "0788 123 456", expertise: "Number theory", relevantExperience: "IMO coach" });
  assert.deepEqual(coachExtraPayload({ ...ok, affiliation: " UR ", yearsOfExperience: "4" }), { phone: "0788 123 456", affiliation: "UR", expertise: "Number theory", relevantExperience: "IMO coach", yearsOfExperience: 4 });
});

test("request states: open, answered, withdrawn, expired; the open one and the latest answer", () => {
  assert.equal(infoRequestState(req(), NOW), "OPEN");
  assert.equal(infoRequestState(req({ answeredAt: "2026-11-17T00:00:00Z" }), NOW), "ANSWERED");
  assert.equal(infoRequestState(req({ cancelledAt: "2026-11-17T00:00:00Z" }), NOW), "CANCELLED");
  assert.equal(infoRequestState(req({ expiresAt: "2026-11-17T11:00:00Z" }), NOW), "EXPIRED");
  const list = [req({ id: "new" }), req({ id: "old", answer: "A", answeredAt: "2026-11-15T00:00:00Z" })];
  assert.equal(openInfoRequest(list, NOW).id, "new");
  assert.equal(latestAnswer(list).id, "old");
  assert.equal(openInfoRequest([], NOW), null);
  assert.equal(openInfoRequest(undefined, NOW), null);
});

test("question and answer validation; the answer body sends only changed corrections", () => {
  assert.ok(questionProblem("Why"));
  assert.equal(questionProblem("Which classes do you teach?"), null);
  assert.deepEqual(answerProblems("", {}), ["Write your answer (up to 4000 characters)."]);
  assert.deepEqual(answerProblems("Yes", { yearsOfExperience: "abc" }), ["Years of experience: a whole number from 0 to 60."]);
  const current = { phone: "+250788123456", position: "Teacher", yearsOfExperience: 3 };
  assert.deepEqual(answerBody(" S4–S6 ", { phone: "+250788123456", position: "Senior teacher", yearsOfExperience: "9" }, current, ["phone", "position", "yearsOfExperience"]),
    { answer: "S4–S6", position: "Senior teacher", yearsOfExperience: 9 });
  // Fields this kind of application may not correct are never sent.
  assert.deepEqual(answerBody("ok", { affiliation: "X" }, current, ["phone", "position", "yearsOfExperience"]), { answer: "ok" });
});
