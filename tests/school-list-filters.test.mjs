// School list filters on every field of the NESA file (owner 2026-11-23): state ⇄ URL ⇄ request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialListState, isFiltered, listFilters, listStateFromParams, listStateToParams } from "../lib/admin/school-directory.ts";

const params = (q) => new URLSearchParams(q);
const PROGRAMME = "4f1c2b3a-1111-4222-8333-944455556666";

test("every filter goes to the URL and back unchanged; defaults leave the URL plain", () => {
  const s = {
    ...initialListState(), level: "AL", programmeCategory: "A_LEVEL_COMBINATION", programme: PROGRAMME, accommodation: "BOARDING",
    issues: "without", ownership: "PRIVATE", cell: "Gihanama", village: "Biryogo", contact: "0788757447", email: "with", phone: "without",
  };
  const url = listStateToParams(s);
  assert.deepEqual(listStateFromParams(params(url)), s);
  assert.equal(listStateToParams(initialListState()), "");
});

test("unknown values in the URL fall back to the defaults", () => {
  const s = listStateFromParams(params("level=XX&programmeCategory=COURSE&programme=abc&accommodation=HOSTEL&ownership=NGO&email=maybe&phone=1&issues=x"));
  assert.deepEqual(s, initialListState());
  assert.equal(listStateFromParams(params("level=al")).level, "AL");
});

test("the request: offerings and source filters always; the new fields only for backends with schoolListFilters", () => {
  const s = { ...initialListState(), level: "OL", programme: PROGRAMME, accommodation: "DAY", issues: "with", ownership: "PUBLIC", cell: "  Gihanama  ",
    village: "Biryogo", contact: " info@gashora.org ", email: "with", phone: "without", programmeCategory: "TVET_TRADE" };
  assert.deepEqual(listFilters(s), { page: 1, limit: 20, level: "OL", programme: PROGRAMME, accommodation: "DAY", hasSourceIssues: true });
  assert.deepEqual(listFilters(s, { allFields: true }), {
    page: 1, limit: 20, level: "OL", programme: PROGRAMME, accommodation: "DAY", hasSourceIssues: true, ownership: "PUBLIC",
    programmeCategory: "TVET_TRADE", cell: "Gihanama", village: "Biryogo", contact: "info@gashora.org", hasEmail: true, hasPhone: false,
  });
});

test("a contact search starts at 3 characters (the backend's minimum); shorter text does not filter", () => {
  const s = (contact) => ({ ...initialListState(), contact });
  assert.equal(listFilters(s("07"), { allFields: true }).contact, undefined);
  assert.equal(isFiltered(s("07"), { allFields: true }), false);
  assert.equal(listFilters(s("078"), { allFields: true }).contact, "078");
  assert.equal(isFiltered(s("078"), { allFields: true }), true);
  assert.equal(isFiltered({ ...initialListState(), ownership: "PRIVATE" }), false);   // not offered without the capability
  assert.equal(isFiltered({ ...initialListState(), ownership: "PRIVATE" }, { allFields: true }), true);
});
