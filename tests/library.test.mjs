// Student Mathematics resource library: pure filtering and grouping (lib/learning/library.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NO_FILTERS,
  countByKind,
  filterResources,
  kindOf,
  mathematicsCourses,
  matchesSearch,
  parseLibraryParams,
  topicLabel,
  yearsOf,
} from "../lib/learning/library.ts";

const MATH = { id: "d1", code: "MATHEMATICS", name: "Mathematics" };
const course = (id, code, sortOrder, discipline = MATH) => ({ id, code, title: code, sortOrder, discipline, status: "PUBLISHED", description: null, counts: { resources: 0, assignments: 0 } });
const res = (id, courseId, type, extra = {}) => ({ id, courseId, divisionId: "div", type, title: `Resource ${id}`, description: null, author: null, source: null, year: null, tags: [], attachments: [], ...extra });

test("only Mathematics courses, in topic order (Algebra, Geometry, Number Theory, Combinatorics)", () => {
  const list = [
    course("c4", "COMBINATORICS", 1),
    course("c2", "GEOMETRY", 4),
    course("x", "PHYSICS_MECHANICS", 0, { id: "d2", code: "PHYSICS", name: "Physics" }),
    course("c1", "ALGEBRA", 3),
    course("c3", "NUMBER_THEORY", 2),
  ];
  assert.deepEqual(mathematicsCourses(list).map((c) => c.code), ["ALGEBRA", "GEOMETRY", "NUMBER_THEORY", "COMBINATORICS"]);
  assert.deepEqual(mathematicsCourses([course("y", "ALGEBRA", 0, null)]), [], "no discipline → not in the library");
  assert.equal(topicLabel({ code: "NUMBER_THEORY", title: "x" }), "Number Theory");
});

test("kinds: books = BOOK + EBOOK, notes = NOTE + ATTACHMENT, past papers = PAST_PAPER", () => {
  assert.equal(kindOf("BOOK"), "books");
  assert.equal(kindOf("EBOOK"), "books");
  assert.equal(kindOf("NOTE"), "notes");
  assert.equal(kindOf("ATTACHMENT"), "notes");
  assert.equal(kindOf("PAST_PAPER"), "papers");
  assert.deepEqual(countByKind([res("1", "c1", "BOOK"), res("2", "c1", "EBOOK"), res("3", "c2", "PAST_PAPER")]), { books: 2, notes: 0, papers: 1 });
});

test("search: every word must appear in title, description, author, source or tags; accents and case ignored", () => {
  const r = res("1", "c1", "BOOK", { title: "Inégalités classiques", author: "Arthur Engel", tags: ["inequalities", "imo"] });
  assert.equal(matchesSearch(r, ""), true);
  assert.equal(matchesSearch(r, "inegalites"), true);
  assert.equal(matchesSearch(r, "ENGEL imo"), true);
  assert.equal(matchesSearch(r, "engel geometry"), false);
});

test("filters combine topic, kind, year and search", () => {
  const all = [
    res("a", "c1", "BOOK", { year: 2020, title: "Algebra book" }),
    res("b", "c1", "PAST_PAPER", { year: 2023, title: "Algebra paper" }),
    res("c", "c2", "PAST_PAPER", { year: 2023, title: "Geometry paper" }),
    res("d", "c2", "NOTE", { title: "Geometry notes" }),
  ];
  const ids = (f) => filterResources(all, { ...NO_FILTERS, ...f }).map((r) => r.id);
  assert.deepEqual(ids({}), ["a", "b", "c", "d"]);
  assert.deepEqual(ids({ topic: "c1" }), ["a", "b"]);
  assert.deepEqual(ids({ kind: "papers" }), ["b", "c"]);
  assert.deepEqual(ids({ kind: "papers", year: 2023, topic: "c2" }), ["c"]);
  assert.deepEqual(ids({ q: "notes" }), ["d"]);
  assert.deepEqual(yearsOf(all), [2023, 2020]);
});

test("URL state: unknown topic, kind or year are ignored (never widen or break the view)", () => {
  const p = (q) => new URLSearchParams(q);
  assert.deepEqual(parseLibraryParams(p("topic=c1&kind=papers&q=engel&year=2023"), ["c1"]), { topic: "c1", kind: "papers", q: "engel", year: 2023 });
  assert.deepEqual(parseLibraryParams(p("topic=other&kind=videos&year=abc"), ["c1"]), NO_FILTERS);
  assert.equal(parseLibraryParams(p(`q=${"x".repeat(150)}`), []).q.length, 100);
});

test("URL state before the topics load: the topic is kept (checked once the topics are known)", () => {
  assert.equal(parseLibraryParams(new URLSearchParams("topic=c9&kind=books"), null).topic, "c9");
  assert.equal(parseLibraryParams(new URLSearchParams("topic=c9"), ["c1"]).topic, "");
});
