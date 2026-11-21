// Schools table (lib/admin/school-directory.ts, 2026-11-19): sort, URL state, "—" for missing places.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ariaSort, initialListState, isFiltered, listFilters, listStateFromParams, listStateToParams, nextSort, orDash,
} from "../lib/admin/school-directory.ts";

const params = (q) => new URLSearchParams(q);

test("the sort is sent only to backends with schoolsTable, and only when it is not the default", () => {
  const s = { ...initialListState(), sort: "verifiedStudents", order: "desc" };
  assert.deepEqual(listFilters(s), { page: 1, limit: 20 });
  assert.deepEqual(listFilters(s, { sortable: true }), { page: 1, limit: 20, sort: "verifiedStudents", order: "desc" });
  assert.deepEqual(listFilters({ ...initialListState(), sort: "name", order: "asc" }, { sortable: true }), { page: 1, limit: 20 });
  assert.deepEqual(listFilters({ ...initialListState(), order: "desc" }, { sortable: true }), { page: 1, limit: 20, order: "desc" });
  // A sort alone does not count as a filter.
  assert.equal(isFiltered(s), false);
});

test("the sort and the filters combine with the page", () => {
  const s = { ...initialListState(), q: "gs", countryCode: "RW", district: "Huye", province: "Southern Province", sector: "Ngoma", status: "active", page: 3, sort: "verifiedStudents", order: "asc" };
  assert.deepEqual(listFilters(s, { sortable: true }), {
    page: 3, limit: 20, q: "gs", countryCode: "RW", province: "Southern Province", district: "Huye", sector: "Ngoma", isActive: true, sort: "verifiedStudents",
  });
});

test("URL state round-trips; defaults leave a plain URL; invalid values fall back", () => {
  assert.equal(listStateToParams(initialListState()), "");
  const s = { ...initialListState(), q: "kacy", countryCode: "RW", province: "Kigali City", district: "Gasabo", sector: "Kacyiru", status: "inactive", source: "LEGACY", code: "with", page: 2, sort: "verifiedStudents", order: "desc" };
  const q = listStateToParams(s);
  assert.equal(q, "q=kacy&country=RW&province=Kigali+City&district=Gasabo&sector=Kacyiru&status=inactive&source=LEGACY&code=with&sort=verifiedStudents&order=desc&page=2");
  assert.deepEqual(listStateFromParams(params(q)), s);
  const bad = listStateFromParams(params("status=closed&source=X&code=maybe&sort=students&order=up&page=-4"));
  assert.deepEqual(bad, initialListState());
  // A district needs its province; a sector its district.
  assert.deepEqual(listStateFromParams(params("district=Huye&sector=Ngoma")), initialListState());
});

test("clicking a header: a new column starts ascending (students: most first); the same column flips", () => {
  assert.deepEqual(nextSort({}, "verifiedStudents"), { sort: "verifiedStudents", order: "desc" });
  assert.deepEqual(nextSort({}, "name"), { sort: "name", order: "desc" });
  assert.deepEqual(nextSort({ sort: "verifiedStudents", order: "desc" }, "verifiedStudents"), { sort: "verifiedStudents", order: "asc" });
  assert.deepEqual(nextSort({ sort: "verifiedStudents", order: "desc" }, "name"), { sort: "name", order: "asc" });
});

test("aria-sort follows the sort", () => {
  assert.equal(ariaSort({}, "name"), "ascending");
  assert.equal(ariaSort({}, "verifiedStudents"), "none");
  assert.equal(ariaSort({ sort: "verifiedStudents", order: "desc" }, "verifiedStudents"), "descending");
  assert.equal(ariaSort({ sort: "verifiedStudents", order: "desc" }, "name"), "none");
});

test("missing district or sector shows —", () => {
  assert.equal(orDash(null), "—");
  assert.equal(orDash("  "), "—");
  assert.equal(orDash("Huye"), "Huye");
});
