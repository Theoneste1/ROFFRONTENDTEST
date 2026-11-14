// School import (dry run → confirm), contacts / offerings payloads and the directory sync's
// access, decision and approve / apply rules (lib/admin/school-import.ts, school-contacts.ts,
// school-sync.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { ApiError } from "../lib/api/errors.ts";
import {
  importDoneSummary,
  importFileProblem,
  importQuery,
  importReadiness,
  interpretImportError,
  previewFromDryRun,
  previewRows,
} from "../lib/admin/school-import.ts";
import {
  contactChanges,
  contactsErrorMessage,
  contactsPayload,
  draftFromOfferings,
  draftsFromContacts,
  emptyDraft,
  offeringsPayload,
  offeringsProblem,
  reasonProblem,
  validateContactDrafts,
  verifyPayload,
} from "../lib/admin/school-contacts.ts";
import {
  applyState,
  approvableCategories,
  approveState,
  blockerText,
  categoryDecisions,
  decisionBlocked,
  individualDecisions,
  outcomeLines,
  proposalPayload,
  proposalProblem,
  runOpen,
  showValue,
  syncAccess,
  syncErrorMessage,
  syncFileProblem,
} from "../lib/admin/school-sync.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
const permits = (...held) => (p) => held.includes(p);

// ─── Import ─────────────────────────────────────────────────────────────────

test("import file checks: type, empty, 1 MB", () => {
  assert.match(importFileProblem(null), /Choose/);
  assert.match(importFileProblem({ name: "schools.txt", size: 10 }), /\.csv or \.xlsx/);
  assert.match(importFileProblem({ name: "schools.csv", size: 0 }), /empty/);
  assert.match(importFileProblem({ name: "schools.xlsx", size: 1024 * 1024 + 1 }), /1 MB/);
  assert.equal(importFileProblem({ name: "Schools.CSV", size: 200 }), null);
});

const cand = { id: "c1", name: "GS Ngoma", code: null, countryCode: "RW", district: "Huye", isActive: true };
const dry = (over = {}) => ({ dryRun: true, totalRows: 3, valid: 3, failed: 0, errors: [], possibleDuplicates: [], canImport: true, ...over });

test("dry run preview: per-row results sorted by row, errors before duplicates on the same row", () => {
  const rows = previewRows([{ row: 4, errors: ["code taken"] }, { row: 2, errors: ["bad sector"] }], [{ row: 3, name: "GS Ngoma", candidates: [cand] }]);
  assert.deepEqual(rows.map((r) => [r.row, r.status]), [[2, "error"], [3, "duplicate"], [4, "error"]]);
  assert.match(rows[1].messages[0], /1 existing school with the same name/);
  const p = previewFromDryRun(dry({ possibleDuplicates: [{ row: 3, name: "GS Ngoma", candidates: [cand, cand] }], reviewToken: "tok", reviewExpiresAt: "2026-11-14T10:00:00Z" }));
  assert.equal(p.possibleDuplicateRows, 1);
  assert.equal(p.reviewToken, "tok");
  assert.match(p.rows[0].messages[0], /2 existing schools/);
});

test("import readiness: errors block; duplicates need the token AND a confirmation; the query carries the token only then", () => {
  assert.equal(importReadiness(null, false).ready, false);
  const errs = previewFromDryRun(dry({ valid: 2, failed: 1, errors: [{ row: 2, errors: ["x"] }], canImport: false }));
  assert.match(importReadiness(errs, true).reason, /Fix the rows/);
  const clean = previewFromDryRun(dry());
  assert.deepEqual(importReadiness(clean, false), { ready: true, reason: null });
  assert.deepEqual(importQuery(clean, true), {}, "no duplicates: no confirmation sent");
  const dup = previewFromDryRun(dry({ possibleDuplicates: [{ row: 2, name: "GS Ngoma", candidates: [cand] }], reviewToken: "tok" }));
  assert.match(importReadiness(dup, false).reason, /Confirm/);
  assert.equal(importReadiness(dup, true).ready, true);
  assert.deepEqual(importQuery(dup, false), {});
  assert.deepEqual(importQuery(dup, true), { confirmPossibleDuplicates: true, reviewToken: "tok" });
  const noToken = { ...dup, reviewToken: null };
  assert.match(importReadiness(noToken, true).reason, /again/);
});

test("import refusals map by code: 422 rows, 409 duplicates with a fresh token, header problems", () => {
  const invalid = interpretImportError(new ApiError(422, "IMPORT_INVALID", "m", { errors: [{ row: 5, errors: ["unknown sector"] }], possibleDuplicates: [] }), 4);
  assert.equal(invalid.preview.failed, 1);
  assert.equal(invalid.preview.valid, 3);
  assert.equal(invalid.preview.canImport, false);
  assert.equal(invalid.needsReview, false);
  const outdated = interpretImportError(new ApiError(409, "IMPORT_REVIEW_OUTDATED", "m", { possibleDuplicates: [{ row: 2, name: "A", candidates: [cand] }], reviewToken: "new" }), 3);
  assert.equal(outdated.needsReview, true);
  assert.equal(outdated.preview.reviewToken, "new");
  assert.match(outdated.message, /changed/);
  assert.match(interpretImportError(new ApiError(409, "POSSIBLE_DUPLICATES_UNCONFIRMED", "m", { possibleDuplicates: [] })).message, /may already exist/);
  const header = interpretImportError(new ApiError(400, "INVALID_IMPORT_HEADER", "m", { missing: ["name"], unknown: ["school"], repeated: [] }));
  assert.match(header.message, /missing column: name; unknown column: school/);
  assert.equal(interpretImportError(new Error("boom")).preview, null);
});

test("import done summary says nothing existing changed", () => {
  assert.equal(
    importDoneSummary({ dryRun: false, importId: "i", totalRows: 2, created: 2, confirmedPossibleDuplicates: 1, schools: [] }),
    "2 schools were created from 2 rows (1 confirmed possible duplicate). No existing school was changed.",
  );
});

// ─── Contacts and offerings ─────────────────────────────────────────────────

const contact = (over = {}) => ({
  id: "k1", type: "EMAIL", value: "head@example.org", rawValue: null, label: null, isPrimary: false, visibility: "ADMIN_ONLY",
  verifiedAt: null, verifiedBy: null, dataSource: null, createdAt: "", updatedAt: "", removedAt: null, removedBy: null, ...over,
});

test("contact drafts: removed contacts are not edited; the payload sends ids, trims, leaves out empty labels", () => {
  const drafts = draftsFromContacts([contact(), contact({ id: "k2", removedAt: "2026-01-01" })]);
  assert.equal(drafts.length, 1);
  const added = { ...emptyDraft("PHONE"), value: " 0788 000 101 ", label: "  ", isPrimary: true };
  assert.deepEqual(contactsPayload([{ ...drafts[0], label: " Head " }, added], "  "), {
    contacts: [
      { type: "EMAIL", value: "head@example.org", id: "k1", label: "Head" },
      { type: "PHONE", value: "0788 000 101", isPrimary: true },
    ],
  });
  assert.equal(contactsPayload([], " checked ").reason, "checked");
});

test("contact validation: format, repeats and one primary per type", () => {
  const a = { ...emptyDraft("EMAIL"), value: "not-mail" };
  const b = { ...emptyDraft("PHONE"), value: "12" };
  const c = { ...emptyDraft("EMAIL"), value: "x@example.org", isPrimary: true };
  const d = { ...emptyDraft("EMAIL"), value: "X@example.org", isPrimary: true };
  const e = { ...emptyDraft("PHONE"), value: "+250788000101" };
  const r = validateContactDrafts([a, b, c, d, e]);
  assert.match(r.rows[a.key], /e-mail/);
  assert.match(r.rows[b.key], /phone/);
  assert.equal(r.rows[c.key], undefined);
  assert.match(r.rows[d.key], /twice/);
  assert.equal(r.rows[e.key], undefined);
  assert.match(r.list, /one primary/);
  assert.match(validateContactDrafts(Array.from({ length: 21 }, (_, i) => ({ ...emptyDraft("OTHER"), value: `v${i}` }))).list, /At most 20/);
  assert.equal(reasonProblem(""), null);
  assert.match(reasonProblem("ab"), /3–500/);
});

test("contact changes: a changed value replaces (and loses verification); a label change keeps it", () => {
  const verified = contact({ verifiedAt: "2026-01-01" });
  const [d] = draftsFromContacts([verified]);
  assert.equal(contactChanges([verified], [d]).changed, false);
  assert.deepEqual(contactChanges([verified], [{ ...d, label: "Office" }]), { added: 0, removed: 0, replaced: 0, edited: 1, verificationLost: 0, changed: true });
  assert.deepEqual(contactChanges([verified], [{ ...d, value: "new@example.org" }]), { added: 0, removed: 0, replaced: 1, edited: 0, verificationLost: 1, changed: true });
  assert.deepEqual(contactChanges([verified], []), { added: 0, removed: 1, replaced: 0, edited: 0, verificationLost: 1, changed: true });
  assert.deepEqual(verifyPayload("REPRESENTATIVES", ""), { visibility: "REPRESENTATIVES" });
  assert.match(contactsErrorMessage(new ApiError(400, "INVALID_CONTACTS", "m", { problems: ["contacts[0]: not an e-mail address."] })), /contacts\[0\]/);
});

test("offerings payload: levels in reference order with qualifiers, programmes unique", () => {
  const draft = draftFromOfferings({ levels: [{ code: "PR", qualifier: null }, { code: "PP", qualifier: "L" }], programmes: [{ id: "p1" }] });
  draft.programmeIds.push("p1", "p2");
  assert.deepEqual(offeringsPayload(draft, ["PP", "PR", "OL"], ""), { levels: [{ code: "PP", qualifier: "L" }, { code: "PR" }], programmes: [{ id: "p1" }, { id: "p2" }] });
  assert.equal(offeringsProblem(draft), null);
  assert.match(offeringsProblem({ levels: { PR: "x".repeat(21) }, programmeIds: [] }), /20 characters/);
});

// ─── Directory sync ─────────────────────────────────────────────────────────

test("the frontend knows the schoolDirectorySync feature", () => {
  assert.ok(KNOWN_FEATURES.includes("schoolDirectorySync"));
});

test("sync access: capability AND schools.manage; approve only with schools.syncDirectory; never on a failed permission load", () => {
  const acc = (over) => syncAccess({ detection: NEW(["schoolDirectorySync"]), detectionLoading: false, permissionsStatus: "ready", can: permits("schools.manage"), ...over });
  assert.deepEqual(acc({}), { loading: false, visible: true, canApprove: false }, "Administrator: review only");
  assert.deepEqual(acc({ can: permits("schools.manage", "schools.syncDirectory") }), { loading: false, visible: true, canApprove: true }, "Super Admin");
  assert.equal(acc({ can: permits() }).visible, false, "coach: nothing");
  assert.equal(acc({ can: permits("schools.syncDirectory") }).canApprove, false, "approve needs the review permission too");
  assert.equal(acc({ detection: NEW(["schoolAdministration"]) }).visible, false, "not advertised");
  assert.equal(acc({ detection: { state: "LEGACY" } }).visible, false);
  assert.equal(acc({ permissionsStatus: "error", can: () => true }).visible, false);
  assert.equal(acc({ permissionsStatus: "loading" }).loading, true);
});

test("sync file and labels", () => {
  assert.equal(syncFileProblem({ name: "nesa.xlsx", size: 10 }), null);
  assert.match(syncFileProblem({ name: "nesa.pdf", size: 10 }), /xlsx or \.csv/);
  assert.match(syncFileProblem({ name: "nesa.csv", size: 11 * 1024 * 1024 }), /10 MB/);
});

const now = new Date("2026-11-14T10:00:00Z");
const later = "2026-11-15T10:00:00Z";

test("decisions: only while open; RESOLVE_CONFLICT only for a Super Admin", () => {
  assert.equal(runOpen({ status: "PREVIEW", expiresAt: later }, now), true);
  assert.equal(runOpen({ status: "PREVIEW", expiresAt: "2026-11-14T09:00:00Z" }, now), false);
  assert.equal(runOpen({ status: "APPLIED", expiresAt: later }, now), false);
  assert.equal(decisionBlocked({ kind: "CHANGE", appliedAt: null }, { open: true, superAdmin: false }), null);
  assert.match(decisionBlocked({ kind: "RESOLVE_CONFLICT", appliedAt: null }, { open: true, superAdmin: false }), /Super Admin/);
  assert.equal(decisionBlocked({ kind: "RESOLVE_CONFLICT", appliedAt: null }, { open: true, superAdmin: true }), null);
  assert.match(decisionBlocked({ kind: "FILL_EMPTY", appliedAt: null }, { open: false, superAdmin: true }), /no longer/);
});

test("category approvals: only category kinds with pending changes, each with its listDigest", () => {
  const cats = [
    { kind: "FILL_EMPTY", total: 3, pending: 2, approved: 1, rejected: 0, listDigest: "a".repeat(64) },
    { kind: "ADD_LEVEL", total: 1, pending: 0, approved: 1, rejected: 0, listDigest: "b".repeat(64) },
    { kind: "CREATE_SCHOOL", total: 1, pending: 1, approved: 0, rejected: 0, listDigest: "c".repeat(64) },
    { kind: "CHANGE", total: 1, pending: 1, approved: 0, rejected: 0, listDigest: "d".repeat(64) },
  ];
  assert.deepEqual(approvableCategories(cats).map((c) => c.kind), ["FILL_EMPTY", "CREATE_SCHOOL"]);
  assert.deepEqual(categoryDecisions(cats, ["CREATE_SCHOOL", "CHANGE", "ADD_LEVEL"], " ok "), { categories: [{ kind: "CREATE_SCHOOL", listDigest: "c".repeat(64) }], note: "ok" });
});

test("individual decisions: unchanged and unknown ones are left out", () => {
  const changes = [{ id: "a", decision: "PENDING" }, { id: "b", decision: "APPROVED" }];
  assert.deepEqual(individualDecisions(changes, { a: "APPROVED", b: "APPROVED", zz: "REJECTED" }), { decisions: [{ changeId: "a", decision: "APPROVED" }] });
});

const summary = (over = {}) => ({
  run: { id: "r", status: "PREVIEW", expiresAt: later, reviewGeneration: 3, approvalCurrent: false, approvedAt: null, ...over.run },
  decidedBy: [], outcomes: {}, changes: { CREATE_SCHOOL: { PENDING: 0, APPROVED: 1, REJECTED: 0 } },
  manualReview: { total: 0, conflicts: 0, possibleDuplicates: 0, byState: { OPEN: 0, PROPOSED: 0, RESOLVED: 0 } },
  blockers: [], ...over, ...(over.run ? { run: { id: "r", status: "PREVIEW", expiresAt: later, reviewGeneration: 3, approvalCurrent: false, ...over.run } } : {}),
});
const SA = { loading: false, visible: true, canApprove: true };
const ADMIN = { loading: false, visible: true, canApprove: false };

test("approve: Super Admin, open run, no blockers", () => {
  assert.equal(approveState(summary(), SA, now).allowed, true);
  assert.match(approveState(summary(), ADMIN, now).reason, /Super Admin/);
  assert.match(approveState(summary({ blockers: [{ code: "RESOLUTION_PENDING", count: 2 }] }), SA, now).reason, /2 proposed resolution/);
  assert.equal(approveState(summary({ run: { status: "APPLIED" } }), SA, now).allowed, false);
  assert.match(blockerText({ code: "SOMETHING_NEW", count: 4 }), /something new \(4\)/);
});

test("apply: needs an unexpired approval of the current review generation", () => {
  const approval = { token: "t".repeat(40), expiresAt: "2026-11-14T10:30:00Z", reviewGeneration: 3 };
  assert.match(applyState(null, summary(), SA, now).reason, /Approve/);
  assert.equal(applyState(approval, summary({ run: { approvalCurrent: true } }), SA, now).allowed, true);
  assert.match(applyState(approval, summary({ run: { approvalCurrent: true, reviewGeneration: 4 } }), SA, now).reason, /changed/);
  assert.match(applyState(approval, summary({ run: { approvalCurrent: false } }), SA, now).reason, /changed/);
  assert.match(applyState(approval, summary({ run: { approvalCurrent: true } }), SA, new Date("2026-11-14T11:00:00Z")).reason, /expired/);
  assert.equal(applyState(approval, summary({ run: { approvalCurrent: true } }), ADMIN, now).allowed, false);
});

test("proposals: manual-review rows only; a possible duplicate links only to a candidate; codes before apply only", () => {
  const dupItem = { outcome: "POSSIBLE_DUPLICATE", details: { candidates: [{ id: "s1" }] }, conflictState: "OPEN" };
  const f = (over) => ({ action: "LINK", schoolId: "s1", code: "", note: "", ...over });
  assert.equal(proposalProblem(dupItem, f({}), "PREVIEW"), null);
  assert.match(proposalProblem(dupItem, f({ schoolId: "s9" }), "PREVIEW"), /listed candidates/);
  assert.match(proposalProblem(dupItem, f({ schoolId: "" }), "PREVIEW"), /Choose/);
  assert.match(proposalProblem({ outcome: "MATCHED", details: null, conflictState: null }, f({}), "PREVIEW"), /Only conflicts/);
  assert.match(proposalProblem({ ...dupItem, conflictState: "RESOLVED" }, f({}), "PREVIEW"), /already resolved/);
  const conflict = { outcome: "CONFLICT", details: { reasons: ["CODE_REPEATED_WITH_DIFFERENT_SCHOOL"] }, conflictState: "OPEN" };
  assert.equal(proposalProblem(conflict, f({ action: "CREATE", schoolId: "", code: "220500" }), "PREVIEW"), null);
  assert.match(proposalProblem(conflict, f({ action: "CREATE", code: "22050" }), "PREVIEW"), /6 digits/);
  assert.match(proposalProblem(conflict, f({ action: "CREATE" }), "APPLIED"), /only be linked/);
  assert.match(proposalProblem(conflict, f({ code: "220500" }), "APPLIED"), /edit/);
  assert.deepEqual(proposalPayload(f({ action: "CREATE", code: " 220500 ", note: "" })), { action: "CREATE", code: "220500" });
  assert.deepEqual(proposalPayload(f({ note: " checked " })), { action: "LINK", schoolId: "s1", note: "checked" });
});

test("values and counts as text; contact values only masked", () => {
  assert.equal(showValue(null), "—");
  assert.equal(showValue({ type: "EMAIL", masked: "h•••@e•••.org" }), "email h•••@e•••.org");
  assert.equal(showValue({ province: "Southern Province", district: "Huye", sector: "Ngoma" }), "Ngoma, Huye, Southern Province");
  assert.equal(showValue({ action: "LINK", schoolId: "x" }), "Link to an existing school");
  assert.deepEqual(outcomeLines({ NEW: 2, MATCHED: 1, INVALID: 0 }), [["MATCHED", 1], ["NEW", 2]]);
  assert.match(syncErrorMessage(new ApiError(409, "SYNC_REVIEW_INCOMPLETE", "m", { blockers: [{ code: "RESOLUTION_PENDING", count: 1 }] })), /1 proposed resolution/);
});
