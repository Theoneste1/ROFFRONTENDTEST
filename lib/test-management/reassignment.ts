/**
 * Reassign a submission (owner 2026-11-28; tests.reassignSubmission: Administrators and Super Administrators): the pure
 * rules of the "Find a submission" page and the "Reassign submission" dialog — which tests are offered for a programme
 * and level, why a test cannot take the answer, the reason's checks, and what changes. Unit-tested in
 * tests/reassignment.test.mjs. The backend remains the authority: it refuses every move these screens would not offer.
 */
import type { Permission } from "../api/types";
import type { ReassignDestination, ReassignOptions, ReassignProblem } from "../api/test-submissions";

export const TESTS_REASSIGN_SUBMISSION: Permission = "tests.reassignSubmission";

export const REASSIGN_REASON_MIN = 5;
export const REASSIGN_REASON_MAX = 500;

/** Why a test cannot take this answer, in plain words (shown next to the test, which is disabled). */
export const REASSIGN_PROBLEM_LABEL: Record<ReassignProblem, string> = {
  SAME_TEST: "current test",
  DUPLICATE_SUBMISSION: "already has an answer from this student",
  FORMAT_MISMATCH: "doesn't accept this kind of answer",
  MARKING_STARTED: "marking has started under the current test",
  TEST_NOT_PUBLISHED: "not published",
};

/** The reason's problem (5–500 characters, spaces at the ends not counted), or undefined when it is fine. */
export function reassignReasonProblem(reason: string): string | undefined {
  const r = reason.trim();
  if (!r) return "Write why the answer is being moved, for example: \"The student is in S5 and chose the Junior test by mistake.\"";
  if (r.length < REASSIGN_REASON_MIN) return `The reason is too short: write at least ${REASSIGN_REASON_MIN} characters so others understand the correction.`;
  if (r.length > REASSIGN_REASON_MAX) return `The reason is too long: keep it to ${REASSIGN_REASON_MAX} characters or fewer.`;
  return undefined;
}

/** A test may take an answer of `level` when it is for every level or for exactly that level. */
export function divisionFits(division: string, level: string): boolean {
  return division === "ALL" || division === level;
}

/** The tests offered for a programme and a level: that programme's, for every level or that level (unavailable ones included, disabled). */
export function destinationsFor(destinations: readonly ReassignDestination[], subjectId: string, level: string): ReassignDestination[] {
  return destinations.filter((d) => d.subject.id === subjectId && divisionFits(d.division, level));
}

/** The programmes (subjects) the dialog offers: the current one first, then every subject with a published test. */
export function subjectsOf(options: Pick<ReassignOptions, "current" | "destinations">): Array<{ id: string; code: string; name: string }> {
  const seen = new Map<string, { id: string; code: string; name: string }>();
  seen.set(options.current.subject.id, options.current.subject);
  for (const d of options.destinations) if (!seen.has(d.subject.id)) seen.set(d.subject.id, d.subject);
  const [first, ...rest] = [...seen.values()];
  return [first, ...rest.sort((a, b) => a.name.localeCompare(b.name))];
}

/**
 * The test selected after the programme or level changed: the one already chosen if it is still offered and can take
 * the answer, else the first that can (the current test included, for a level-only change), else none ("").
 */
export function pickDestination(offered: readonly ReassignDestination[], chosen: string): string {
  if (offered.some((d) => d.id === chosen && d.available)) return chosen;
  return offered.find((d) => d.available)?.id ?? "";
}

export interface ReassignChoice {
  subjectId: string;
  level: string;
  testId: string;
  reason: string;
}

export interface ReassignProblems {
  test?: string;
  level?: string;
  reason?: string;
}

/** Every problem with a choice before it is reviewed (empty: ready to review). */
export function reassignChoiceProblems(options: ReassignOptions, choice: ReassignChoice): ReassignProblems {
  const out: ReassignProblems = {};
  const dest = options.destinations.find((d) => d.id === choice.testId);
  if (!choice.level) out.level = "Choose the correct level.";
  if (!choice.testId || !dest) {
    out.test = "Choose the test the answer belongs to. If none is listed, publish the right test first, or choose another programme or level.";
  } else if (!dest.available) {
    out.test = `This test cannot take the answer (${REASSIGN_PROBLEM_LABEL[dest.problem ?? "TEST_NOT_PUBLISHED"]}). Choose another test.`;
  } else if (choice.level && !divisionFits(dest.division, choice.level)) {
    out.test = `"${dest.title}" is for another level. Choose a test for this level or for every level.`;
  } else if (choice.testId === options.current.test.id && choice.level === options.current.level) {
    out.test = "Nothing changes: choose another test or another level.";
  }
  const reason = reassignReasonProblem(choice.reason);
  if (reason) out.reason = reason;
  return out;
}

/** What the correction changes (the review step highlights these). */
export function reassignChanges(options: ReassignOptions, choice: Pick<ReassignChoice, "testId" | "level">) {
  const dest = options.destinations.find((d) => d.id === choice.testId);
  return {
    test: choice.testId !== options.current.test.id,
    subject: !!dest && dest.subject.id !== options.current.subject.id,
    level: choice.level !== options.current.level,
  };
}

/** "3 pages + typed answer", "1 page", "typed answer", "nothing". */
export function answerSummary(answer: { pages: number; typed: boolean }): string {
  const pages = answer.pages > 0 ? `${answer.pages} page${answer.pages === 1 ? "" : "s"}` : "";
  if (pages && answer.typed) return `${pages} + typed answer`;
  return pages || (answer.typed ? "typed answer" : "nothing");
}

/** What is kept, for the review step's note: "3 uploaded pages, the typed answer". */
export function keptParts(answer: { pages: number; typed: boolean }): string[] {
  const parts: string[] = [];
  if (answer.pages > 0) parts.push(`${answer.pages} uploaded page${answer.pages === 1 ? "" : "s"}`);
  if (answer.typed) parts.push("the typed answer");
  return parts;
}
