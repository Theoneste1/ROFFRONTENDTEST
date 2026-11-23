// "View as" (read only, owner 2026-11-23): the rank rule, the button's visibility, the banner, the ticket address, the
// viewing tab's sessionStorage (never localStorage), the plain messages, and the capability / permission names.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VIEW_AS_ENDED_TEXT, VIEW_AS_EXPLANATION, VIEW_AS_STORAGE_KEY, canViewAs, clearViewingSession, readViewingSession, saveViewingSession,
  viewAsBannerText, viewAsButtonVisible, viewAsTicketUrl,
} from "../lib/auth/view-as.ts";
import { ApiError, errorMessage } from "../lib/api/errors.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const ROLES = ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"];
const EXPECTED = {
  SUPER_ADMIN: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH", "ADMIN"],
  ADMIN: ["STUDENT", "TEACHER", "MENTOR", "HEAD_COACH"],
  HEAD_COACH: ["STUDENT", "TEACHER", "MENTOR"],
  MENTOR: [], TEACHER: [], STUDENT: [],
};

function memoryStore() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const session = (expiresAt) => ({
  accessToken: "h.p.s",
  expiresAt,
  viewAs: { sessionId: "s1", actor: { id: "a", name: "Ada Admin", role: "ADMIN" }, target: { id: "t", name: "Amina Uwase", role: "STUDENT" }, expiresAt },
});

test("lower roles only: the same table as the backend; never yourself, never a Super Administrator", () => {
  for (const actor of ROLES) {
    for (const target of ROLES) {
      assert.equal(canViewAs({ id: "a", role: actor }, { id: "t", role: target }), EXPECTED[actor].includes(target), `${actor} → ${target}`);
    }
  }
  assert.equal(canViewAs({ id: "x", role: "SUPER_ADMIN" }, { id: "x", role: "STUDENT" }), false);
  assert.equal(canViewAs(null, { id: "t", role: "STUDENT" }), false);
  assert.equal(canViewAs({ id: "a", role: "__proto__" }, { id: "t", role: "STUDENT" }), false);
});

test("the button: the feature, the permission, the rank, and never inside a viewing tab", () => {
  const base = { featureOn: true, canImpersonate: true, viewing: false, actor: { id: "a", role: "ADMIN" }, target: { id: "t", role: "STUDENT" } };
  assert.equal(viewAsButtonVisible(base), true);
  assert.equal(viewAsButtonVisible({ ...base, featureOn: false }), false);
  assert.equal(viewAsButtonVisible({ ...base, canImpersonate: false }), false);
  assert.equal(viewAsButtonVisible({ ...base, viewing: true }), false);
  assert.equal(viewAsButtonVisible({ ...base, target: { id: "t", role: "ADMIN" } }), false);
  assert.equal(viewAsButtonVisible({ ...base, actor: { id: "c", role: "MENTOR" } }), false);
  assert.equal(viewAsButtonVisible({ ...base, actor: { id: "h", role: "HEAD_COACH" }, target: { id: "t", role: "MENTOR" } }), true);
});

test("plain words: banner, explanation, ended page", () => {
  assert.equal(viewAsBannerText({ target: { id: "t", name: "Amina Uwase", role: "STUDENT" } }), "Viewing as Amina Uwase (Student) — read only.");
  assert.equal(viewAsBannerText({ target: { id: "t", name: "Jean Bosco", role: "MENTOR" } }), "Viewing as Jean Bosco (Coach) — read only.");
  assert.equal(VIEW_AS_EXPLANATION("Amina Uwase"),
    "Opens a new tab where you see the platform exactly as Amina Uwase does. Nothing can be changed there. Your own session stays open in this tab.");
  assert.match(VIEW_AS_ENDED_TEXT, /30 minutes/);
  assert.match(VIEW_AS_ENDED_TEXT, /Close this tab\.$/);
});

test("the viewing tab's address carries the single-use ticket, encoded", () => {
  assert.equal(viewAsTicketUrl("abc_-DEF"), "/view-as?ticket=abc_-DEF");
  assert.equal(viewAsTicketUrl("a+b/c="), "/view-as?ticket=a%2Bb%2Fc%3D");
});

test("sessionStorage of the tab: saved, read back while valid; expired or malformed entries are removed", () => {
  const store = memoryStore();
  const now = Date.parse("2026-11-23T12:00:00Z");
  saveViewingSession(session("2026-11-23T12:30:00Z"), store);
  assert.deepEqual(readViewingSession(store, now), session("2026-11-23T12:30:00Z"));
  assert.equal(readViewingSession(store, Date.parse("2026-11-23T12:30:00Z")), null, "expired at expiresAt");
  assert.equal(store.map.has(VIEW_AS_STORAGE_KEY), false);
  for (const bad of ["not json", "{}", JSON.stringify({ ...session("2026-11-23T12:30:00Z"), accessToken: "" }), JSON.stringify({ ...session("x"), viewAs: { sessionId: "s" } })]) {
    store.setItem(VIEW_AS_STORAGE_KEY, bad);
    assert.equal(readViewingSession(store, now), null, bad);
    assert.equal(store.map.has(VIEW_AS_STORAGE_KEY), false, bad);
  }
  saveViewingSession(session("2026-11-23T12:30:00Z"), store);
  clearViewingSession(store);
  assert.equal(readViewingSession(store, now), null);
});

test("storage failures never throw (blocked storage: the tab simply is not a viewing tab)", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(readViewingSession(broken), null);
  saveViewingSession(session("2026-11-23T12:30:00Z"), broken);
  clearViewingSession(broken);
  assert.equal(readViewingSession(null), null);
});

test("refusals in plain words: the backend's read-only sentence; the ended message", () => {
  const msg = "You are viewing the platform as Amina Uwase. Nothing can be changed in this view. Return to your own account to make changes.";
  assert.equal(errorMessage(new ApiError(403, "VIEW_AS_READ_ONLY", msg)), msg);
  assert.match(errorMessage(new ApiError(403, "VIEW_AS_READ_ONLY", "")), /Nothing can be changed in this view/);
  assert.equal(errorMessage(new ApiError(401, "VIEW_AS_ENDED", "x")), VIEW_AS_ENDED_TEXT);
});

test("viewAs is a known backend feature", () => {
  assert.ok(KNOWN_FEATURES.includes("viewAs"));
});
