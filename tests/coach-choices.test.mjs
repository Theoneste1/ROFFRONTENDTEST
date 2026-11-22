// Coach application choices (lib/accounts/coach-choices.ts): occupation dropdown, expertise and experience tick lists,
// each with "Other"; sent as readable text the server already accepts.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXPERIENCE_OPTIONS,
  EXPERTISE_AREAS,
  EXPERTISE_GROUPS,
  OCCUPATIONS,
  OTHER_CHOICE,
  joinChoices,
  singleChoice,
  splitChoices,
  toggleChoice,
} from "../lib/accounts/coach-choices.ts";
import { LIMITS, validateCoachExtra } from "../lib/accounts/application-details.ts";
import { COACH_RULES } from "../lib/accounts/coach-application.ts";

test("lists: grouped by subject, no duplicates, every option fits the server's limits", () => {
  assert.deepEqual(EXPERTISE_GROUPS.map((g) => g.subject), ["Mathematics", "Computing", "Physics"]);
  for (const list of [EXPERTISE_AREAS, EXPERIENCE_OPTIONS, OCCUPATIONS]) assert.equal(new Set(list).size, list.length);
  for (const o of OCCUPATIONS) assert.ok(o.length >= COACH_RULES.occupationMin && o.length <= COACH_RULES.occupationMax, o);
  // Everything ticked, plus a long "Other", still fits.
  assert.ok(joinChoices(EXPERTISE_AREAS, EXPERTISE_AREAS, "x".repeat(200)).length <= LIMITS.expertise[1]);
  assert.ok(joinChoices(EXPERIENCE_OPTIONS, EXPERIENCE_OPTIONS, "x".repeat(300)).length <= LIMITS.relevantExperience[1]);
});

test("the text sent: chosen options in list order, then Other", () => {
  assert.equal(joinChoices(EXPERTISE_AREAS, ["Geometry", "Algebra"], null), "Algebra; Geometry");
  assert.equal(joinChoices(EXPERTISE_AREAS, ["Mechanics"], "  Game theory "), "Mechanics; Other: Game theory");
  assert.equal(joinChoices(EXPERTISE_AREAS, [], "Astronomy"), "Other: Astronomy");
  assert.equal(joinChoices(EXPERTISE_AREAS, [], ""), "", "Other ticked but empty sends nothing");
  assert.equal(joinChoices(EXPERTISE_AREAS, [], null), "");
});

test("back from text: known options, the rest as Other (round trip)", () => {
  assert.deepEqual(splitChoices(EXPERTISE_AREAS, "Algebra; Geometry; Other: Game theory"), { chosen: ["Algebra", "Geometry"], other: "Game theory" });
  assert.deepEqual(splitChoices(EXPERTISE_AREAS, ""), { chosen: [], other: null });
  assert.deepEqual(splitChoices(EXPERTISE_AREAS, "combinatorics and number theory"), { chosen: [], other: "combinatorics and number theory" });
  const text = joinChoices(EXPERIENCE_OPTIONS, [EXPERIENCE_OPTIONS[2], EXPERIENCE_OPTIONS[0]], "Team leader");
  const back = splitChoices(EXPERIENCE_OPTIONS, text);
  assert.equal(joinChoices(EXPERIENCE_OPTIONS, back.chosen, back.other), text);
});

test("toggle and single choice", () => {
  assert.deepEqual(toggleChoice(["Algebra"], "Geometry"), ["Algebra", "Geometry"]);
  assert.deepEqual(toggleChoice(["Algebra", "Geometry"], "Algebra"), ["Geometry"]);
  assert.equal(singleChoice(OCCUPATIONS, ""), "");
  assert.equal(singleChoice(OCCUPATIONS, "Engineer"), "Engineer");
  assert.equal(singleChoice(OCCUPATIONS, "Accountant"), OTHER_CHOICE);
  assert.equal(singleChoice(OCCUPATIONS, "", true), OTHER_CHOICE);
});

test("messages: nothing ticked asks to tick one; too long says so", () => {
  const base = { phone: "0788123456", affiliation: "", expertise: "", relevantExperience: "", yearsOfExperience: "" };
  const e = validateCoachExtra(base);
  assert.match(e.expertise, /Tick at least one area of expertise/);
  assert.match(e.relevantExperience, /Tick at least one kind of experience/);
  assert.deepEqual(validateCoachExtra({ ...base, expertise: "Algebra", relevantExperience: "Taught at a university" }), {});
  assert.match(validateCoachExtra({ ...base, expertise: "x".repeat(1001), relevantExperience: "ok" }).expertise, /at most 1000/);
});
