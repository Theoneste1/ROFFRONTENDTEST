/**
 * Bulk course assignment for a coach (capability adminDivisions, owner 2026-11-22): every course of every active
 * division, every course of one division, or chosen courses in chosen divisions. Only pairs a division offers (active
 * divisions, courses that are not archived) are assigned; pairs already assigned are not duplicated. The server
 * previews first (dryRun), then applies. Pure helpers tested in tests/bulk-assign.test.mjs.
 */
import type { BulkAssignmentInput, BulkAssignmentResult } from "../api/admin";

/** "ALL", "DIVISION:<id>" or "PAIRS". */
export type BulkAssignChoice = string;

/** The request for a choice; undefined with the problem when something is missing. */
export function bulkAssignInput(mentorId: string, choice: BulkAssignChoice, courseIds: readonly string[], divisionIds: readonly string[]): { input?: BulkAssignmentInput; problem?: string } {
  if (choice === "ALL") return { input: { mentorId, scope: "ALL" } };
  if (choice.startsWith("DIVISION:")) {
    const divisionId = choice.slice("DIVISION:".length);
    return divisionId ? { input: { mentorId, scope: "DIVISION", divisionId } } : { problem: "Choose a division." };
  }
  if (choice === "PAIRS") {
    if (!courseIds.length) return { problem: "Choose at least one course." };
    if (!divisionIds.length) return { problem: "Choose at least one division." };
    const pairs = courseIds.flatMap((courseId) => divisionIds.map((divisionId) => ({ courseId, divisionId })));
    if (pairs.length > 500) return { problem: "Choose at most 500 course and division pairs at once." };
    return { input: { mentorId, scope: "PAIRS", pairs } };
  }
  return { problem: "Choose what to assign." };
}

/** "3 new · 1 restored · 2 already assigned · 1 not offered". */
export function bulkAssignSummary(c: BulkAssignmentResult["counts"]): string {
  const parts = [`${c.new} new`];
  if (c.reactivate) parts.push(`${c.reactivate} restored`);
  if (c.alreadyAssigned) parts.push(`${c.alreadyAssigned} already assigned`);
  if (c.notOffered) parts.push(`${c.notOffered} not offered`);
  return parts.join(" · ");
}

/** Whether applying the preview would change anything. */
export function bulkAssignChanges(c: BulkAssignmentResult["counts"]): boolean {
  return c.new + c.reactivate > 0;
}

export const PAIR_STATE_TEXT: Record<string, string> = { NEW: "New", REACTIVATE: "Restored", ALREADY_ASSIGNED: "Already assigned" };
